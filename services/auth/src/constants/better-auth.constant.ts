import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import type { BetterAuthOptions } from "better-auth";
import { admin, jwt, twoFactor } from "better-auth/plugins";
import { Redacted } from "effect";
import type { AuthConfig } from "../configs/auth.config.js";
import {
  assertPasskeyMfaCredential,
  assertPasskeyUserVerification,
  createPasskeyMfaPlugin,
} from "../passkey-mfa.plugin.js";
import {
  DASHBOARD_CLIENT_REFERENCE,
  oauthIdentifierOptions,
} from "./oauth-identifiers.js";

export const AUTH_BASE_PATH = "/api/auth";
export { DASHBOARD_CLIENT_REFERENCE } from "./oauth-identifiers.js";

export interface AuthRuntimePolicy {
  readonly clientReference?: string;
  readonly isSuperuser?: (userId: string) => Promise<boolean>;
  readonly validAudiences?: ReadonlyArray<string>;
}

export function createAuthOptions(
  config: AuthConfig,
  policy: AuthRuntimePolicy = {},
) {
  const passkeyOrigins = [
    config.baseUrl,
    ...config.trustedOrigins.filter((origin) => {
      const url = new URL(origin);
      return url.protocol === "http:" || url.protocol === "https:";
    }),
  ];

  return {
    appName: "Otakuma Auth",
    basePath: AUTH_BASE_PATH,
    baseURL: config.baseUrl,
    disabledPaths: ["/token"],
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      admin(),
      jwt(),
      passkey({
        authentication: {
          afterVerification: async ({ clientData, ctx, verification }) => {
            await assertPasskeyMfaCredential(
              ctx,
              clientData.id,
              verification.authenticationInfo.userVerified,
            );
          },
        },
        authenticatorSelection: {
          userVerification: "required",
        },
        origin: passkeyOrigins,
        registration: {
          afterVerification: ({ verification }) => {
            assertPasskeyUserVerification(
              verification.registrationInfo?.userVerified === true,
            );
          },
        },
        rpID: config.passkeyRpId,
        rpName: "Otakuma Auth",
      }),
      createPasskeyMfaPlugin(),
      twoFactor({
        issuer: "Otakuma Auth",
      }),
      oauthProvider({
        allowDynamicClientRegistration: config.allowDynamicClientRegistration,
        allowPublicClientPrelogin: true,
        consentPage: "/consent",
        clientPrivileges: ({ user }) =>
          user ? (policy.isSuperuser?.(user.id) ?? false) : false,
        clientReference: () =>
          policy.clientReference ?? DASHBOARD_CLIENT_REFERENCE,
        loginPage: "/sign-in",
        ...oauthIdentifierOptions,
        scopes: ["openid", "profile", "email", "offline_access"],
        silenceWarnings: {
          oauthAuthServerConfig: true,
        },
        signup: {
          page: "/sign-up",
        },
        ...(policy.validAudiences
          ? { validAudiences: [...policy.validAudiences] }
          : {}),
      }),
    ],
    secret: Redacted.value(config.secret),
    trustedOrigins: [...config.trustedOrigins],
  } satisfies BetterAuthOptions;
}
