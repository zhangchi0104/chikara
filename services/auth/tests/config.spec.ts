import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { readAuthConfig } from "../src/configs/auth.config.js";

const validBindings = {
  AUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION: "false" as const,
  AUTH_TRUSTED_ORIGINS: "http://localhost:8787, chikara:// ",
  BETTER_AUTH_SECRET: "a-secure-development-secret-with-32-characters",
  BETTER_AUTH_URL: "http://localhost:8787",
};

describe("auth configuration", () => {
  it.effect("parses Worker bindings", () =>
    Effect.sync(() => {
      expect(readAuthConfig(validBindings)).toEqual({
        allowDynamicClientRegistration: false,
        baseUrl: "http://localhost:8787",
        secret: validBindings.BETTER_AUTH_SECRET,
        trustedOrigins: ["http://localhost:8787", "chikara://"],
      });
    }),
  );

  it.effect("defaults optional Worker bindings", () =>
    Effect.sync(() => {
      expect(
        readAuthConfig({
          BETTER_AUTH_SECRET: validBindings.BETTER_AUTH_SECRET,
          BETTER_AUTH_URL: validBindings.BETTER_AUTH_URL,
        }),
      ).toEqual({
        allowDynamicClientRegistration: false,
        baseUrl: "http://localhost:8787",
        secret: validBindings.BETTER_AUTH_SECRET,
        trustedOrigins: [],
      });
    }),
  );

  it.effect("rejects a short Better Auth secret", () =>
    Effect.sync(() => {
      expect(() =>
        readAuthConfig({
          ...validBindings,
          BETTER_AUTH_SECRET: "too-short",
        }),
      ).toThrow(/length of at least 32/);
    }),
  );

  it.effect("rejects a base URL with a path", () =>
    Effect.sync(() => {
      expect(() =>
        readAuthConfig({
          ...validBindings,
          BETTER_AUTH_URL: "https://auth.example.com/api/auth",
        }),
      ).toThrow(/BETTER_AUTH_URL must be an HTTP\(S\) origin/);
    }),
  );

  it.effect("rejects invalid dynamic-registration flags", () =>
    Effect.sync(() => {
      expect(() =>
        readAuthConfig({
          ...validBindings,
          AUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION: "yes",
        }),
      ).toThrow(/Expected "true" \| "false"/);
    }),
  );
});
