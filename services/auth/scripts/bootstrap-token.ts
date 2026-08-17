import { BOOTSTRAP_KEY } from "../src/dashboard/dashboard.auth.js";
import { createIdentifier, digest } from "../src/dashboard/dashboard.crypto.js";

const mode = process.argv.includes("--remote") ? "--remote" : "--local";
const token = createIdentifier("otakuma_bootstrap_");
const value = JSON.stringify({ digest: await digest(token) });
const processResult = Bun.spawn(
  [
    "bunx",
    "wrangler",
    "kv",
    "key",
    "put",
    BOOTSTRAP_KEY,
    value,
    "--binding",
    "AUTH_BOOTSTRAP",
    "--ttl",
    "900",
    mode,
    "--config",
    "./wrangler.jsonc",
  ],
  {
    cwd: new URL("..", import.meta.url).pathname,
    stderr: "inherit",
    stdout: "inherit",
  },
);

const exitCode = await processResult.exited;
if (exitCode !== 0) process.exit(exitCode);

console.log("\nOne-time dashboard bootstrap token (expires in 15 minutes):");
console.log(token);
