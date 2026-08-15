import { describe, expect, it } from "@effect/vitest";
import { Effect, Redacted } from "effect";
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
      const { secret, ...config } = readAuthConfig(validBindings);

      expect(config).toEqual({
        allowDynamicClientRegistration: false,
        baseUrl: "http://localhost:8787",
        trustedOrigins: ["http://localhost:8787", "chikara://"],
      });
      expect(String(secret)).toBe("<redacted>");
      expect(Redacted.value(secret)).toBe(validBindings.BETTER_AUTH_SECRET);
    }),
  );

  it.effect("defaults optional Worker bindings", () =>
    Effect.sync(() => {
      const { secret, ...config } = readAuthConfig({
        BETTER_AUTH_SECRET: validBindings.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: validBindings.BETTER_AUTH_URL,
      });

      expect(config).toEqual({
        allowDynamicClientRegistration: false,
        baseUrl: "http://localhost:8787",
        trustedOrigins: [],
      });
      expect(String(secret)).toBe("<redacted>");
      expect(Redacted.value(secret)).toBe(validBindings.BETTER_AUTH_SECRET);
    }),
  );

  it.effect("rejects a short Better Auth secret", () =>
    Effect.sync(() => {
      expect(() =>
        readAuthConfig({
          ...validBindings,
          BETTER_AUTH_SECRET: "too-short",
        }),
      ).toThrow(/Invalid data <redacted>/);
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
