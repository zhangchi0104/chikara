import { CFConfigProvider } from "@repo/cloudflare/effect";
import { Config, Effect, type Redacted, Schema } from "effect";

export interface AuthConfigBindings {
  readonly AUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION?: string;
  readonly AUTH_PASSKEY_RP_ID?: string;
  readonly AUTH_TRUSTED_ORIGINS?: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
}

export interface AuthBindings extends AuthCloudflareBindings {}

export interface AuthConfig {
  readonly allowDynamicClientRegistration: boolean;
  readonly baseUrl: string;
  readonly passkeyRpId: string;
  readonly secret: Redacted.Redacted<string>;
  readonly trustedOrigins: ReadonlyArray<string>;
}

export class AuthConfigError extends Schema.TaggedErrorClass<AuthConfigError>()(
  "AuthConfigError",
  { message: Schema.String },
) {}

function isHttpOrigin(url: URL): boolean {
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash
  );
}

function parseTrustedOrigins(value: string): ReadonlyArray<string> {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isTrustedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (!/^[a-z][a-z\d+.-]*:\/\//i.test(origin)) return false;
    if (url.protocol !== "http:" && url.protocol !== "https:") return true;
    return isHttpOrigin(url) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function normalizeTrustedOrigins(value: string): ReadonlyArray<string> {
  return parseTrustedOrigins(value).map((origin) => {
    const url = new URL(origin);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : origin;
  });
}

const hostnamePattern =
  /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)*[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i;

function isPasskeyRpId(value: string): boolean {
  const hostname = value.trim();
  return hostname.length <= 253 && hostnamePattern.test(hostname);
}

function supportsRpId(origin: string, rpId: string): boolean {
  const hostname = new URL(origin).hostname.toLowerCase();
  return hostname === rpId || hostname.endsWith(`.${rpId}`);
}

const HttpOrigin = Schema.URLFromString.check(
  Schema.makeFilter(
    (url) => isHttpOrigin(url) || "BETTER_AUTH_URL must be an HTTP(S) origin",
  ),
);

const TrustedOrigins = Schema.String.check(
  Schema.makeFilter(
    (value) =>
      parseTrustedOrigins(value).every(isTrustedOrigin) ||
      "AUTH_TRUSTED_ORIGINS entries must be valid origins with a URL scheme",
  ),
);

const PasskeyRpId = Schema.String.check(
  Schema.makeFilter(
    (value) =>
      value === "" ||
      isPasskeyRpId(value) ||
      "AUTH_PASSKEY_RP_ID must be a hostname without a scheme, port, or path",
  ),
);

const authConfig = Config.all({
  allowDynamicClientRegistration: Config.schema(
    Schema.Literals(["true", "false"]),
    "AUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION",
  ).pipe(
    Config.withDefault("false"),
    Config.map((value) => value === "true"),
  ),
  baseUrl: Config.schema(HttpOrigin, "BETTER_AUTH_URL").pipe(
    Config.map((url) => url.origin),
  ),
  passkeyRpId: Config.schema(PasskeyRpId, "AUTH_PASSKEY_RP_ID").pipe(
    Config.withDefault(""),
    Config.map((value) => value.trim().toLowerCase()),
  ),
  secret: Config.schema(
    Schema.Redacted(Schema.String.check(Schema.isMinLength(32))),
    "BETTER_AUTH_SECRET",
  ),
  trustedOrigins: Config.schema(TrustedOrigins, "AUTH_TRUSTED_ORIGINS").pipe(
    Config.withDefault(""),
    Config.map(normalizeTrustedOrigins),
  ),
});

export function readAuthConfig(bindings: AuthConfigBindings) {
  const provider = CFConfigProvider.fromBindings(bindings);
  return Effect.gen(function* () {
    const config = yield* authConfig.parse(provider);
    const passkeyRpId = config.passkeyRpId || new URL(config.baseUrl).hostname;
    const webOrigins = [config.baseUrl, ...config.trustedOrigins].filter(
      (origin) => {
        const protocol = new URL(origin).protocol;
        return protocol === "http:" || protocol === "https:";
      },
    );
    const incompatibleOrigin = webOrigins.find(
      (origin) => !supportsRpId(origin, passkeyRpId),
    );
    if (incompatibleOrigin) {
      return yield* new AuthConfigError({
        message: `AUTH_PASSKEY_RP_ID ${passkeyRpId} cannot be used from ${incompatibleOrigin}`,
      });
    }
    return { ...config, passkeyRpId } satisfies AuthConfig;
  });
}
