import { betterAuth } from "better-auth";
import { pipe } from "effect";
import { type AuthBindings, readAuthConfig } from "./configs/auth.config.js";
import { createAuthOptions } from "./constants/better-auth.constant .js";
import {
  isSuperuserId,
  listAudienceIdentifiers,
} from "./dashboard/dashboard.access.js";

export async function createAuth(bindings: AuthBindings) {
  const validAudiences = await listAudienceIdentifiers(bindings.AUTH_DB);
  return betterAuth({
    ...createAuthOptions(pipe(bindings, readAuthConfig), {
      isSuperuser: (userId) => isSuperuserId(bindings.AUTH_DB, userId),
      validAudiences,
    }),
    database: bindings.AUTH_DB,
  });
}
