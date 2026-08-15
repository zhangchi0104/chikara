import { betterAuth } from "better-auth";
import { pipe } from "effect";
import { type AuthBindings, readAuthConfig } from "./configs/auth.config.js";
import { createAuthOptions } from "./constants/better-auth.constant .js";

export function createAuth(bindings: AuthBindings) {
  return betterAuth({
    ...pipe(bindings, readAuthConfig, createAuthOptions),
    database: bindings.AUTH_DB,
  });
}
