import { fileURLToPath } from "node:url";
import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

const authConfigPath = fileURLToPath(
  new URL("../../services/auth/wrangler.jsonc", import.meta.url),
);
const authStatePath = fileURLToPath(
  new URL("../../services/auth/.wrangler/state", import.meta.url),
);

export default defineConfig({
  adapter: cloudflare({
    auxiliaryWorkers: [
      {
        configPath: authConfigPath,
        devOnly: true,
      },
    ],
    imageService: "compile",
    persistState: { path: authStatePath },
  }),
  output: "server",
  server: { port: 4321 },
});
