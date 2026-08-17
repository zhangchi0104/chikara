import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coordinateTwoFactorRequest } from "../src/two-factor.coordination.js";
import { readTwoFactorState } from "../src/two-factor.state.js";
import { applyAuthMigrations } from "./auth-database.js";

const userId = "activity-user";

function request(path: string, body: object = {}): Request {
  return new Request(`http://localhost:8787/api/auth${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("two-factor account activity", () => {
  let database: D1Database;
  let miniflare: Miniflare;

  beforeEach(async () => {
    miniflare = new Miniflare(
      convertV4MiniflareOptions({
        compatibilityDate: "2026-08-08",
        d1Databases: ["AUTH_DB"],
        modules: true,
        script: "export default { fetch() { return new Response('ok') } }",
      }),
    );
    database = (await miniflare.getBindings<{ AUTH_DB: D1Database }>()).AUTH_DB;
    await applyAuthMigrations(database);
    await database
      .prepare(
        `INSERT INTO "user"
         (id, name, email, emailVerified, createdAt, updatedAt, twoFactorEnabled)
         VALUES (?, 'Activity User', 'activity@example.com', 1, 1, 1, 0)`,
      )
      .bind(userId)
      .run();
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("classifies each successful serialized two-factor mutation", async () => {
    async function run(path: string, mutate: () => Promise<void>) {
      const response = await coordinateTwoFactorRequest(
        request(path),
        database,
        userId,
        async () => {
          await mutate();
          return Response.json({ status: true });
        },
      );
      expect(response.status).toBe(200);
    }

    const createPending = () =>
      database
        .prepare(
          `INSERT INTO "twoFactor"
           (id, secret, backupCodes, userId, verified)
           VALUES (?, 'secret', 'codes', ?, 0)`,
        )
        .bind(crypto.randomUUID(), userId)
        .run()
        .then(() => undefined);
    await run("/two-factor/enable", createPending);
    await run("/two-factor/verify-totp", () =>
      database
        .batch([
          database
            .prepare('UPDATE "user" SET "twoFactorEnabled" = 1 WHERE "id" = ?')
            .bind(userId),
          database
            .prepare('UPDATE "twoFactor" SET "verified" = 1 WHERE "userId" = ?')
            .bind(userId),
        ])
        .then(() => undefined),
    );
    await run("/two-factor/generate-backup-codes", () => Promise.resolve());
    await run("/two-factor/disable", () =>
      database
        .batch([
          database
            .prepare('UPDATE "user" SET "twoFactorEnabled" = 0 WHERE "id" = ?')
            .bind(userId),
          database
            .prepare('DELETE FROM "twoFactor" WHERE "userId" = ?')
            .bind(userId),
        ])
        .then(() => undefined),
    );
    await run("/two-factor/enable", createPending);
    await run("/two-factor/disable", () =>
      database
        .prepare('DELETE FROM "twoFactor" WHERE "userId" = ?')
        .bind(userId)
        .run()
        .then(() => undefined),
    );

    const rows = await database
      .prepare(
        `SELECT eventType FROM authAuditEvent
         WHERE subjectUserId = ? AND eventType LIKE 'two_factor.%'
         ORDER BY rowid ASC`,
      )
      .bind(userId)
      .all<{ eventType: string }>();
    expect(rows.results.map(({ eventType }) => eventType)).toEqual([
      "two_factor.setup_started",
      "two_factor.enabled",
      "two_factor.recovery_codes_regenerated",
      "two_factor.disabled",
      "two_factor.setup_started",
      "two_factor.setup_reset",
    ]);
  });

  it("records an automatic repair only after password authentication succeeds", async () => {
    await database
      .prepare('UPDATE "user" SET "twoFactorEnabled" = 1 WHERE "id" = ?')
      .bind(userId)
      .run();
    let forwards = 0;
    const response = await coordinateTwoFactorRequest(
      request("/sign-in/email", {
        email: "activity@example.com",
        password: "correct password",
      }),
      database,
      userId,
      async () => {
        forwards += 1;
        return forwards === 1
          ? Response.json({ twoFactorRedirect: true })
          : Response.json({ token: "issued" });
      },
    );

    expect(response.status).toBe(200);
    expect(forwards).toBe(2);
    expect(await readTwoFactorState(database, userId)).toBe("disabled");
    expect(
      await database
        .prepare(
          `SELECT actorUserId, eventType FROM authAuditEvent
           WHERE subjectUserId = ? AND eventType = 'two_factor.auto_repaired'`,
        )
        .bind(userId)
        .first(),
    ).toEqual({ actorUserId: null, eventType: "two_factor.auto_repaired" });
  });
});
