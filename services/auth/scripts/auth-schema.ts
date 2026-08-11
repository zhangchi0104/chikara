import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { createAuthOptions } from "../src/auth-options.js";

export const auth = betterAuth({
  ...createAuthOptions({
    allowDynamicClientRegistration: false,
    baseUrl: "http://localhost:8787",
    secret: "schema-generation-secret-at-least-32-characters",
    trustedOrigins: [],
  }),
  database: new DatabaseSync(":memory:"),
});
