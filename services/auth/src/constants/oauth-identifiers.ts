import type { OAuthOptions, StoreTokenType } from "@better-auth/oauth-provider";
import { constantTimeEqual } from "better-auth/crypto";
import { Effect, Schema } from "effect";
import { createIdentifier, digest } from "../dashboard/dashboard.crypto.js";

export const DASHBOARD_CLIENT_REFERENCE = "otakuma:auth-dashboard";
export const LEGACY_DASHBOARD_CLIENT_REFERENCE = "chikara:auth-dashboard";
export const DASHBOARD_CLIENT_REFERENCES = [
  DASHBOARD_CLIENT_REFERENCE,
  LEGACY_DASHBOARD_CLIENT_REFERENCE,
] as const;

const clientSecretPrefixes = ["otakuma_cs_", "chikara_cs_"] as const;
const opaqueAccessTokenPrefixes = ["otakuma_at_", "chikara_at_"] as const;
const refreshTokenPrefixes = ["otakuma_rt_", "chikara_rt_"] as const;

class OAuthIdentifierError extends Schema.TaggedErrorClass<OAuthIdentifierError>()(
  "OAuthIdentifierError",
  { message: Schema.String },
) {}

function removeKnownPrefix(
  value: string,
  prefixes: ReadonlyArray<string>,
): string | undefined {
  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return undefined;
}

function hashClientSecret(value: string) {
  return Effect.gen(function* () {
    const unprefixed = removeKnownPrefix(value, clientSecretPrefixes);
    if (unprefixed === undefined) {
      return yield* new OAuthIdentifierError({
        message: "OAuth client credentials must use a recognized prefix.",
      });
    }
    return yield* digest(unprefixed);
  });
}

function verifyClientSecret(value: string, storedHash: string) {
  const unprefixed = removeKnownPrefix(value, clientSecretPrefixes);
  if (unprefixed === undefined) return Effect.succeed(false);
  return digest(unprefixed).pipe(
    Effect.map((hash) => constantTimeEqual(hash, storedHash)),
  );
}

function tokenPrefixes(
  type: StoreTokenType,
): ReadonlyArray<string> | undefined {
  if (type === "access_token") return opaqueAccessTokenPrefixes;
  if (type === "refresh_token") return refreshTokenPrefixes;
  return undefined;
}

function hashToken(value: string, type: StoreTokenType) {
  const prefixes = tokenPrefixes(type);
  if (!prefixes) return digest(value);
  const unprefixed = removeKnownPrefix(value, prefixes);
  return digest(unprefixed ?? `unsupported-${type}-prefix:${value}`);
}

type IdentifierOptions = Pick<
  OAuthOptions,
  | "generateClientId"
  | "generateClientSecret"
  | "generateOpaqueAccessToken"
  | "generateRefreshToken"
  | "storeClientSecret"
  | "storeTokens"
>;

export const oauthIdentifierOptions = {
  generateClientId: () => createIdentifier("otakuma_"),
  generateClientSecret: () => createIdentifier("otakuma_cs_"),
  generateOpaqueAccessToken: () => createIdentifier("otakuma_at_"),
  generateRefreshToken: () => createIdentifier("otakuma_rt_"),
  storeClientSecret: {
    hash: (value) => Effect.runPromise(hashClientSecret(value)),
    verify: (value, storedHash) =>
      Effect.runPromise(verifyClientSecret(value, storedHash)),
  },
  storeTokens: {
    hash: (value, type) => Effect.runPromise(hashToken(value, type)),
  },
} satisfies IdentifierOptions;
