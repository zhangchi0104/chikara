import { CFConfigProvider } from "@repo/cloudflare/effect";
import { Config, Effect, type Redacted, Schema } from "effect";

export interface AuthConfigBindings {
  readonly AUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION?: string;
  readonly AUTH_TRUSTED_ORIGINS?: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
}

export interface AuthBindings
  extends AuthCloudflareBindings,
    AuthConfigBindings {}

export interface AuthConfig {
  readonly allowDynamicClientRegistration: boolean;
  readonly baseUrl: string;
  readonly secret: Redacted.Redacted<string>;
  readonly trustedOrigins: ReadonlyArray<string>;
}

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

const HttpOrigin = Schema.URLFromString.check(
  Schema.makeFilter(
    (url) => isHttpOrigin(url) || "BETTER_AUTH_URL must be an HTTP(S) origin",
  ),
);

const TrustedOrigins = Schema.String.check(
  Schema.makeFilter(
    (value) =>
      parseTrustedOrigins(value).every((origin) =>
        /^[a-z][a-z\d+.-]*:\/\/\S*$/i.test(origin),
      ) || "AUTH_TRUSTED_ORIGINS entries must include a URL scheme",
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
  secret: Config.schema(
    Schema.Redacted(Schema.String.check(Schema.isMinLength(32))),
    "BETTER_AUTH_SECRET",
  ),
  trustedOrigins: Config.schema(TrustedOrigins, "AUTH_TRUSTED_ORIGINS").pipe(
    Config.withDefault(""),
    Config.map(parseTrustedOrigins),
  ),
});

export function readAuthConfig(bindings: AuthConfigBindings): AuthConfig {
  const provider = CFConfigProvider.fromBindings(bindings);
  return Effect.runSync(authConfig.parse(provider));
}
