import { Effect } from "effect";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTwoFactorState } from "../src/account-protection.js";
import type { AuthBindings } from "../src/configs/auth.config.js";
import { applyAuthMigrations } from "./auth-database.js";
import { createTestAuth } from "./auth-runtime.js";

const email = "recovery@example.com";
const password = "another secure password";

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("The response did not set a session cookie.");
  return header.split(";", 1)[0] ?? "";
}

describe("two-factor state recovery", () => {
  let bindings: AuthBindings;
  let cookie: string;
  let miniflare: Miniflare;
  let userId: string;

  beforeEach(async () => {
    miniflare = new Miniflare(
      convertV4MiniflareOptions({
        bindings: {
          AUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION: "false",
          AUTH_TRUSTED_ORIGINS: "http://localhost:4321",
          BETTER_AUTH_SECRET: "integration-test-secret-at-least-32-characters",
          BETTER_AUTH_URL: "http://localhost:8787",
        },
        compatibilityDate: "2026-08-08",
        d1Databases: ["AUTH_DB"],
        kvNamespaces: ["AUTH_BOOTSTRAP"],
        modules: true,
        script: "export default { fetch() { return new Response('ok') } }",
      }),
    );
    bindings = await miniflare.getBindings<AuthBindings>();
    await applyAuthMigrations(bindings.AUTH_DB);
    const signedUp = await (
      await Effect.runPromise(createTestAuth(bindings))
    ).handler(
      new Request("http://localhost:8787/api/auth/sign-up/email", {
        body: JSON.stringify({ email, name: "Recovery Member", password }),
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:4321",
        },
        method: "POST",
      }),
    );
    expect(signedUp.status).toBe(200);
    cookie = sessionCookie(signedUp);
    const user = await bindings.AUTH_DB.prepare(
      'SELECT "id" FROM "user" WHERE "email" = ?',
    )
      .bind(email)
      .first<{ id: string }>();
    if (!user) throw new Error("The recovery account was not created.");
    userId = user.id;

    const enabled = await post("/api/auth/two-factor/enable", { password });
    expect(enabled.status, await enabled.clone().text()).toBe(200);
    expect(
      await Effect.runPromise(readTwoFactorState(bindings.AUTH_DB, userId)),
    ).toBe("pending");
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  async function post(path: string, body: object): Promise<Response> {
    return (await Effect.runPromise(createTestAuth(bindings))).handler(
      new Request(`http://localhost:8787${path}`, {
        body: JSON.stringify(body),
        headers: {
          cookie,
          "content-type": "application/json",
          origin: "http://localhost:4321",
        },
        method: "POST",
      }),
    );
  }

  async function expectPasswordConfirmedReset(): Promise<void> {
    const rejected = await post("/api/auth/two-factor/disable", {
      password: "wrong password",
    });
    expect(rejected.status).toBe(400);

    const disabled = await post("/api/auth/two-factor/disable", { password });
    expect(disabled.status, await disabled.clone().text()).toBe(200);
    expect(await disabled.json()).toEqual({ status: true });
    expect(
      await Effect.runPromise(readTwoFactorState(bindings.AUTH_DB, userId)),
    ).toBe("disabled");
  }

  it("resets a pending enrollment after confirming the password", async () => {
    await expectPasswordConfirmedReset();
  });

  it("resets a verified row whose user flag is disabled", async () => {
    await bindings.AUTH_DB.prepare(
      'UPDATE "twoFactor" SET "verified" = 1 WHERE "userId" = ?',
    )
      .bind(userId)
      .run();
    expect(
      await Effect.runPromise(readTwoFactorState(bindings.AUTH_DB, userId)),
    ).toBe("inconsistent");
    await expectPasswordConfirmedReset();
  });

  it("resets an enabled user flag with a pending factor", async () => {
    await bindings.AUTH_DB.prepare(
      'UPDATE "user" SET "twoFactorEnabled" = 1 WHERE "id" = ?',
    )
      .bind(userId)
      .run();
    expect(
      await Effect.runPromise(readTwoFactorState(bindings.AUTH_DB, userId)),
    ).toBe("inconsistent");
    await expectPasswordConfirmedReset();
  });

  it("resets an enabled user flag without a factor", async () => {
    await bindings.AUTH_DB.prepare('DELETE FROM "twoFactor" WHERE "userId" = ?')
      .bind(userId)
      .run();
    await bindings.AUTH_DB.prepare(
      'UPDATE "user" SET "twoFactorEnabled" = 1 WHERE "id" = ?',
    )
      .bind(userId)
      .run();
    expect(
      await Effect.runPromise(readTwoFactorState(bindings.AUTH_DB, userId)),
    ).toBe("inconsistent");
    await expectPasswordConfirmedReset();
  });
});
