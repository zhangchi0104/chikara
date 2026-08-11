import { betterAuth } from "better-auth";
import { createAuthOptions } from "./auth-options.js";
import { type AuthBindings, readAuthConfig } from "./configs/auth.config.js";

export function createAuth(bindings: AuthBindings) {
  return betterAuth({
    ...createAuthOptions(readAuthConfig(bindings)),
    database: bindings.AUTH_DB,
  });
}
