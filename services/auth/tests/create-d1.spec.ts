import { describe, expect, it } from "@effect/vitest";
import {
  findDatabaseId,
  PLACEHOLDER_DATABASE_ID,
  readAuthDatabaseId,
  replacePlaceholderDatabaseId,
} from "../scripts/d1-config.js";

const config = `{
  "d1_databases": [{
    "binding": "AUTH_DB",
    "database_id": "${PLACEHOLDER_DATABASE_ID}"
  }]
}`;

describe("D1 creation script", () => {
  it("reads the auth database ID", () => {
    expect(readAuthDatabaseId(config)).toBe(PLACEHOLDER_DATABASE_ID);
  });

  it("finds an existing database returned by Wrangler", () => {
    expect(
      findDatabaseId(
        [
          { name: "another-database", uuid: crypto.randomUUID() },
          {
            name: "chikara-auth",
            uuid: "12345678-1234-1234-1234-123456789abc",
          },
        ],
        "chikara-auth",
      ),
    ).toBe("12345678-1234-1234-1234-123456789abc");
  });

  it("replaces only the placeholder database ID", () => {
    const databaseId = "12345678-1234-1234-1234-123456789abc";
    const updated = replacePlaceholderDatabaseId(config, databaseId);

    expect(readAuthDatabaseId(updated)).toBe(databaseId);
    expect(updated).not.toContain(PLACEHOLDER_DATABASE_ID);
  });
});
