import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migrationPaths = [
  "0001_better_auth.sql",
  "0002_auth_dashboard.sql",
  "0003_better_auth_admin.sql",
  "0004_auth_security.sql",
  "0005_two_factor_mutation_guard.sql",
  "0006_drop_redundant_two_factor_index.sql",
  "0007_auth_audit.sql",
  "0008_unique_passkey_credential.sql",
  "0009_normalize_two_factor_verification.sql",
];

function migrationStatements(sql: string): ReadonlyArray<string> {
  const statements: string[] = [];
  let lines: string[] = [];
  let trigger = false;
  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed && lines.length === 0) continue;
    if (lines.length === 0) trigger = /^CREATE TRIGGER\b/i.test(trimmed);
    lines.push(line);
    const complete = trigger ? /^END;$/i.test(trimmed) : trimmed.endsWith(";");
    if (!complete) continue;
    statements.push(lines.join("\n").trim().replace(/;$/, ""));
    lines = [];
    trigger = false;
  }
  if (lines.some((line) => line.trim())) {
    throw new Error("An auth migration ended with an incomplete statement.");
  }
  return statements;
}

export async function applyAuthMigrations(database: D1Database): Promise<void> {
  for (const filename of migrationPaths) {
    const sql = await readFile(
      resolve(import.meta.dirname, "../migrations", filename),
      "utf8",
    );
    for (const statement of migrationStatements(sql)) {
      await database.prepare(statement).run();
    }
  }
}
