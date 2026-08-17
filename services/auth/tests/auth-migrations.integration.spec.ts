import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, describe, expect, it } from "vitest";
import { applyAuthMigrations } from "./auth-database.js";

interface IndexRow {
  readonly name: string;
  readonly unique: number;
}

interface TableRow {
  readonly name: string;
}

describe("auth migrations", () => {
  let miniflare: Miniflare | undefined;

  afterEach(async () => {
    await miniflare?.dispose();
  });

  it("keeps only the unique user index for two-factor records", async () => {
    miniflare = new Miniflare(
      convertV4MiniflareOptions({
        compatibilityDate: "2026-08-08",
        d1Databases: ["AUTH_DB"],
        modules: true,
        script: "export default { fetch() { return new Response('ok') } }",
      }),
    );
    const bindings = await miniflare.getBindings<{
      readonly AUTH_DB: D1Database;
    }>();
    await applyAuthMigrations(bindings.AUTH_DB);

    const indexes = await bindings.AUTH_DB.prepare(
      'PRAGMA index_list("twoFactor")',
    ).all<IndexRow>();
    expect(indexes.results).toContainEqual(
      expect.objectContaining({
        name: "twoFactor_userId_unique_idx",
        unique: 1,
      }),
    );
    expect(indexes.results.map(({ name }) => name)).not.toContain(
      "twoFactor_userId_idx",
    );
    const passkeyIndexes = await bindings.AUTH_DB.prepare(
      'PRAGMA index_list("passkey")',
    ).all<IndexRow>();
    expect(passkeyIndexes.results).toContainEqual(
      expect.objectContaining({
        name: "passkey_credentialID_unique_idx",
        unique: 1,
      }),
    );
    expect(passkeyIndexes.results.map(({ name }) => name)).not.toContain(
      "passkey_credentialID_idx",
    );

    await bindings.AUTH_DB.batch([
      bindings.AUTH_DB.prepare(
        'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, twoFactorEnabled) VALUES (?, ?, ?, 1, ?, ?, 1)',
      ).bind("protected-user", "Protected", "protected@example.com", 1, 1),
      bindings.AUTH_DB.prepare(
        'INSERT INTO "twoFactor" (id, secret, backupCodes, userId, verified) VALUES (?, ?, ?, ?, 1)',
      ).bind("protected-factor", "secret", "codes", "protected-user"),
    ]);
    await expect(
      bindings.AUTH_DB.prepare('DELETE FROM "twoFactor" WHERE "userId" = ?')
        .bind("protected-user")
        .run(),
    ).rejects.toThrow(/TWO_FACTOR_ALREADY_ENABLED/);
  });

  it("creates the bounded account-activity timeline index", async () => {
    miniflare = new Miniflare(
      convertV4MiniflareOptions({
        compatibilityDate: "2026-08-08",
        d1Databases: ["AUTH_DB"],
        modules: true,
        script: "export default { fetch() { return new Response('ok') } }",
      }),
    );
    const bindings = await miniflare.getBindings<{
      readonly AUTH_DB: D1Database;
    }>();
    await applyAuthMigrations(bindings.AUTH_DB);

    expect(
      await bindings.AUTH_DB.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'authAuditEvent'",
      ).first<TableRow>(),
    ).toEqual({ name: "authAuditEvent" });
    const indexes = await bindings.AUTH_DB.prepare(
      'PRAGMA index_list("authAuditEvent")',
    ).all<IndexRow>();
    expect(indexes.results).toContainEqual(
      expect.objectContaining({
        name: "authAuditEvent_subject_timeline_idx",
      }),
    );
  });
});
