import { describe, expect, it } from "@effect/vitest";
import { Effect, Redacted } from "effect";
import {
  type AuthConfigBindings,
  readAuthConfig,
} from "../src/configs/auth.config.js";

const validBindings = {
  AUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION: "false" as const,
  AUTH_TRUSTED_ORIGINS: "http://localhost:8787/, chikara:// ",
  BETTER_AUTH_SECRET: "a-secure-development-secret-with-32-characters",
  BETTER_AUTH_URL: "http://localhost:8787",
};

function expectConfigFailure(bindings: AuthConfigBindings, pattern: RegExp) {
  return Effect.gen(function* () {
    const error = yield* Effect.flip(readAuthConfig(bindings));
    expect(String(error)).toMatch(pattern);
  });
}

describe("auth configuration", () => {
  it.effect("parses Worker bindings", () =>
    Effect.gen(function* () {
      const { secret, ...config } = yield* readAuthConfig(validBindings);

      expect(config).toEqual({
        allowDynamicClientRegistration: false,
        baseUrl: "http://localhost:8787",
        passkeyRpId: "localhost",
        trustedOrigins: ["http://localhost:8787", "chikara://"],
      });
      expect(String(secret)).toBe("<redacted>");
      expect(Redacted.value(secret)).toBe(validBindings.BETTER_AUTH_SECRET);
    }),
  );

  it.effect("defaults optional Worker bindings", () =>
    Effect.gen(function* () {
      const { secret, ...config } = yield* readAuthConfig({
        BETTER_AUTH_SECRET: validBindings.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: validBindings.BETTER_AUTH_URL,
      });

      expect(config).toEqual({
        allowDynamicClientRegistration: false,
        baseUrl: "http://localhost:8787",
        passkeyRpId: "localhost",
        trustedOrigins: [],
      });
      expect(String(secret)).toBe("<redacted>");
      expect(Redacted.value(secret)).toBe(validBindings.BETTER_AUTH_SECRET);
    }),
  );

  it.effect("rejects a short Better Auth secret", () =>
    expectConfigFailure(
      { ...validBindings, BETTER_AUTH_SECRET: "too-short" },
      /Invalid data <redacted>/,
    ),
  );

  it.effect("rejects a base URL with a path", () =>
    expectConfigFailure(
      {
        ...validBindings,
        BETTER_AUTH_URL: "https://auth.example.com/api/auth",
      },
      /BETTER_AUTH_URL must be an HTTP\(S\) origin/,
    ),
  );

  it.effect("rejects malformed trusted origins", () =>
    expectConfigFailure(
      { ...validBindings, AUTH_TRUSTED_ORIGINS: "http://" },
      /AUTH_TRUSTED_ORIGINS entries must be valid origins with a URL scheme/,
    ),
  );

  it.effect("rejects trusted HTTP URLs with a path", () =>
    expectConfigFailure(
      {
        ...validBindings,
        AUTH_TRUSTED_ORIGINS: "https://dashboard.example.com/profile",
      },
      /AUTH_TRUSTED_ORIGINS entries must be valid origins with a URL scheme/,
    ),
  );

  it.effect("accepts a shared passkey RP ID for sibling origins", () =>
    Effect.gen(function* () {
      const { secret: _secret, ...config } = yield* readAuthConfig({
        ...validBindings,
        AUTH_PASSKEY_RP_ID: "Example.COM",
        AUTH_TRUSTED_ORIGINS: "https://dashboard.example.com",
        BETTER_AUTH_URL: "https://auth.example.com",
      });

      expect(config.passkeyRpId).toBe("example.com");
    }),
  );

  it.effect("accepts the production auth and dashboard origins", () =>
    Effect.gen(function* () {
      const { secret: _secret, ...config } = yield* readAuthConfig({
        ...validBindings,
        AUTH_PASSKEY_RP_ID: "auth.otakuma.dev",
        AUTH_TRUSTED_ORIGINS: "https://dashboard.auth.otakuma.dev,chikara://",
        BETTER_AUTH_URL: "https://chikara.auth.otakuma.dev",
      });

      expect(config).toEqual({
        allowDynamicClientRegistration: false,
        baseUrl: "https://chikara.auth.otakuma.dev",
        passkeyRpId: "auth.otakuma.dev",
        trustedOrigins: ["https://dashboard.auth.otakuma.dev", "chikara://"],
      });
    }),
  );

  it.effect("rejects a passkey RP ID that cannot serve a trusted origin", () =>
    expectConfigFailure(
      {
        ...validBindings,
        AUTH_PASSKEY_RP_ID: "auth.example.com",
        AUTH_TRUSTED_ORIGINS: "https://dashboard.example.com",
        BETTER_AUTH_URL: "https://auth.example.com",
      },
      /AUTH_PASSKEY_RP_ID auth\.example\.com cannot be used from https:\/\/dashboard\.example\.com/,
    ),
  );

  it.effect("rejects a passkey RP ID containing a scheme or port", () =>
    expectConfigFailure(
      {
        ...validBindings,
        AUTH_PASSKEY_RP_ID: "https://auth.example.com:443",
      },
      /AUTH_PASSKEY_RP_ID must be a hostname/,
    ),
  );

  it.effect("rejects invalid dynamic-registration flags", () =>
    expectConfigFailure(
      {
        ...validBindings,
        AUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION: "yes",
      },
      /Expected "true" \| "false"/,
    ),
  );
});
