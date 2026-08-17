import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  coordinatesTwoFactorMutation,
  recoverableSignInUserId,
  rejectUnsafeEnrollment,
} from "../src/two-factor.guard.js";
import {
  readTwoFactorState,
  type TwoFactorState,
} from "../src/two-factor.state.js";
import { applyAuthMigrations } from "./auth-database.js";

interface StoredFactorState {
  readonly enabled: 0 | 1;
  readonly expected: TwoFactorState;
  readonly label: string;
  readonly verified?: 0 | 1 | null;
}

const states: ReadonlyArray<StoredFactorState> = [
  { enabled: 0, expected: "disabled", label: "disabled" },
  { enabled: 0, expected: "pending", label: "pending", verified: 0 },
  { enabled: 1, expected: "enabled", label: "enabled", verified: 1 },
  {
    enabled: 1,
    expected: "enabled",
    label: "enabled with a legacy null verification flag",
    verified: null,
  },
  {
    enabled: 0,
    expected: "inconsistent",
    label: "a verified factor without the user flag",
    verified: 1,
  },
  {
    enabled: 1,
    expected: "inconsistent",
    label: "the user flag without a factor",
  },
  {
    enabled: 1,
    expected: "inconsistent",
    label: "the user flag with a pending factor",
    verified: 0,
  },
];

describe("two-factor mutation guard", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare(
      convertV4MiniflareOptions({
        compatibilityDate: "2026-08-08",
        d1Databases: ["AUTH_DB"],
        modules: true,
        script: "export default { fetch() { return new Response('ok') } }",
      }),
    );
    const bindings = await miniflare.getBindings<{
      AUTH_DB: D1Database;
    }>();
    database = bindings.AUTH_DB;
    await applyAuthMigrations(database);
    await database
      .prepare(
        'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)',
      )
      .bind("member-1", "Member", "member@example.com", Date.now(), Date.now())
      .run();
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  async function storeState(state: StoredFactorState): Promise<void> {
    await database
      .prepare('UPDATE "user" SET "twoFactorEnabled" = 0 WHERE "id" = ?')
      .bind("member-1")
      .run();
    await database
      .prepare('DELETE FROM "twoFactor" WHERE "userId" = ?')
      .bind("member-1")
      .run();
    if (state.verified !== undefined) {
      await database
        .prepare(
          'INSERT INTO "twoFactor" (id, secret, backupCodes, userId, verified) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(
          `factor-${state.label}`,
          "encrypted-secret",
          "encrypted-codes",
          "member-1",
          state.verified,
        )
        .run();
    }
    await database
      .prepare('UPDATE "user" SET "twoFactorEnabled" = ? WHERE "id" = ?')
      .bind(state.enabled, "member-1")
      .run();
  }

  it("coordinates only account two-factor mutations", () => {
    expect(
      coordinatesTwoFactorMutation(
        new Request("https://auth.example/api/auth/two-factor/enable", {
          method: "POST",
        }),
      ),
    ).toBe(true);
    expect(
      coordinatesTwoFactorMutation(
        new Request("https://auth.example/api/auth/two-factor/verify-totp", {
          method: "GET",
        }),
      ),
    ).toBe(false);
    expect(
      coordinatesTwoFactorMutation(
        new Request("https://auth.example/api/auth/sign-in/email", {
          method: "POST",
        }),
      ),
    ).toBe(false);
  });

  it.each(states)("classifies $label", async (state) => {
    await storeState(state);
    expect(await readTwoFactorState(database, "member-1")).toBe(state.expected);
  });

  it("treats a missing account as inconsistent", async () => {
    expect(await readTwoFactorState(database, "missing-user")).toBe(
      "inconsistent",
    );
  });

  it("finds a recoverable sign-in from form data using normalized email", async () => {
    await database
      .prepare(
        'UPDATE "user" SET "email" = ?, "twoFactorEnabled" = 1 WHERE "id" = ?',
      )
      .bind("älex@example.com", "member-1")
      .run();
    const request = new Request("https://auth.example/api/auth/sign-in/email", {
      body: new URLSearchParams({ email: "ÄLEX@example.com" }),
      method: "POST",
    });

    expect(await recoverableSignInUserId(request, database)).toBe("member-1");
  });

  it.each([
    { code: undefined, state: states[0] },
    { code: "TWO_FACTOR_SETUP_PENDING", state: states[1] },
    { code: "TWO_FACTOR_ALREADY_ENABLED", state: states[2] },
    { code: "TWO_FACTOR_REPAIR_REQUIRED", state: states[4] },
  ])("guards $state.label enrollment with $code", async ({ code, state }) => {
    if (!state) throw new Error("The state fixture is missing.");
    await storeState(state);
    const guarded = await rejectUnsafeEnrollment(
      new Request("https://auth.example/api/auth/two-factor/enable", {
        method: "POST",
      }),
      database,
      "member-1",
    );

    if (!code) {
      expect(guarded).toBeUndefined();
      return;
    }
    expect(guarded?.status).toBe(409);
    expect(await guarded?.json()).toMatchObject({ code });
  });
});
