import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { Redacted } from "effect";
import { createAuthOptions } from "../src/constants/better-auth.constant.js";

export const auth = betterAuth({
  ...createAuthOptions({
    allowDynamicClientRegistration: false,
    baseUrl: "http://localhost:8787",
    passkeyRpId: "localhost",
    secret: Redacted.make("schema-generation-secret-at-least-32-characters"),
    trustedOrigins: [],
  }),
  database: new DatabaseSync(":memory:"),
});
