export const PLACEHOLDER_DATABASE_ID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function isDatabaseId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function readAuthDatabaseId(config: string): string {
  const match = config.match(
    /"binding"\s*:\s*"AUTH_DB"[\s\S]*?"database_id"\s*:\s*"([^"]+)"/,
  );
  if (!match?.[1]) {
    throw new Error("Could not find AUTH_DB.database_id");
  }
  return match[1];
}

export function findDatabaseId(
  databases: unknown,
  databaseName: string,
): string | undefined {
  if (!Array.isArray(databases)) {
    throw new Error("Wrangler returned an invalid D1 database list");
  }
  for (const database of databases) {
    if (
      typeof database === "object" &&
      database !== null &&
      "name" in database &&
      database.name === databaseName &&
      "uuid" in database &&
      typeof database.uuid === "string"
    ) {
      return database.uuid;
    }
  }
  return undefined;
}

export function replacePlaceholderDatabaseId(
  config: string,
  databaseId: string,
): string {
  if (!isDatabaseId(databaseId)) {
    throw new Error(
      `Wrangler returned an invalid D1 database ID: ${databaseId}`,
    );
  }
  const firstPlaceholder = config.indexOf(PLACEHOLDER_DATABASE_ID);
  if (
    firstPlaceholder === -1 ||
    config.indexOf(PLACEHOLDER_DATABASE_ID, firstPlaceholder + 1) !== -1
  ) {
    throw new Error("Expected exactly one placeholder D1 database ID");
  }
  return config.replace(PLACEHOLDER_DATABASE_ID, databaseId);
}
