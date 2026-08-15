import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findDatabaseId,
  isDatabaseId,
  PLACEHOLDER_DATABASE_ID,
  readAuthDatabaseId,
  replacePlaceholderDatabaseId,
} from "./d1-config.js";

const AUTH_BINDING = "AUTH_DB";
const DATABASE_NAME = "chikara-auth";

function runWrangler(
  executable: string,
  args: ReadonlyArray<string>,
  cwd: string,
) {
  return spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
  });
}

function main(): number {
  const serviceDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const configPath = path.join(serviceDirectory, "wrangler.jsonc");
  const wranglerPath = path.join(
    serviceDirectory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler",
  );
  const config = readFileSync(configPath, "utf8");
  const configuredId = readAuthDatabaseId(config);

  if (configuredId !== PLACEHOLDER_DATABASE_ID) {
    if (!isDatabaseId(configuredId)) {
      throw new Error(`Invalid configured D1 database ID: ${configuredId}`);
    }
    process.stdout.write(
      `D1 database is already configured: ${configuredId}\n`,
    );
    return 0;
  }

  const listResult = runWrangler(
    wranglerPath,
    ["d1", "list", "--json", "--config", configPath],
    serviceDirectory,
  );
  if (listResult.error) throw listResult.error;
  if (listResult.status !== 0) {
    process.stderr.write(listResult.stderr);
    return listResult.status ?? 1;
  }

  const databases: unknown = JSON.parse(listResult.stdout);
  const existingId = findDatabaseId(databases, DATABASE_NAME);
  if (existingId) {
    writeFileSync(configPath, replacePlaceholderDatabaseId(config, existingId));
    process.stdout.write(`Configured existing D1 database: ${existingId}\n`);
    return 0;
  }

  const createResult = spawnSync(
    wranglerPath,
    [
      "d1",
      "create",
      DATABASE_NAME,
      ...process.argv.slice(2),
      "--config",
      configPath,
      "--binding",
      AUTH_BINDING,
      "--update-config",
    ],
    { cwd: serviceDirectory, stdio: "inherit" },
  );
  if (createResult.error) throw createResult.error;
  if (createResult.status !== 0) return createResult.status ?? 1;

  const updatedId = readAuthDatabaseId(readFileSync(configPath, "utf8"));
  if (updatedId === PLACEHOLDER_DATABASE_ID || !isDatabaseId(updatedId)) {
    throw new Error("D1 was created, but wrangler.jsonc was not updated");
  }
  process.stdout.write(`Configured new D1 database: ${updatedId}\n`);
  return 0;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
