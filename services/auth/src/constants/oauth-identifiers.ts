import type { OAuthOptions, StoreTokenType } from "@better-auth/oauth-provider";
import { constantTimeEqual } from "better-auth/crypto";
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

function removeKnownPrefix(
  value: string,
  prefixes: ReadonlyArray<string>,
): string | undefined {
  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return undefined;
}

async function hashClientSecret(value: string): Promise<string> {
  const unprefixed = removeKnownPrefix(value, clientSecretPrefixes);
  if (unprefixed === undefined) {
    throw new Error("OAuth client credentials must use a recognized prefix.");
  }
  return digest(unprefixed);
}

async function verifyClientSecret(
  value: string,
  storedHash: string,
): Promise<boolean> {
  const unprefixed = removeKnownPrefix(value, clientSecretPrefixes);
  if (unprefixed === undefined) return false;
  return constantTimeEqual(await digest(unprefixed), storedHash);
}

function tokenPrefixes(
  type: StoreTokenType,
): ReadonlyArray<string> | undefined {
  if (type === "access_token") return opaqueAccessTokenPrefixes;
  if (type === "refresh_token") return refreshTokenPrefixes;
  return undefined;
}

async function hashToken(value: string, type: StoreTokenType): Promise<string> {
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
    hash: hashClientSecret,
    verify: verifyClientSecret,
  },
  storeTokens: {
    hash: hashToken,
  },
} satisfies IdentifierOptions;
