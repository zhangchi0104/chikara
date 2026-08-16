import { oauthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthOptions } from "better-auth";
import { admin, jwt } from "better-auth/plugins";
import { Redacted } from "effect";
import type { AuthConfig } from "../configs/auth.config.js";
import { createIdentifier } from "../dashboard/dashboard.crypto.js";

export const AUTH_BASE_PATH = "/api/auth";
export const DASHBOARD_CLIENT_REFERENCE = "chikara:auth-dashboard";

export interface AuthRuntimePolicy {
  readonly isSuperuser?: (userId: string) => Promise<boolean>;
  readonly validAudiences?: ReadonlyArray<string>;
}

export function createAuthOptions(
  config: AuthConfig,
  policy: AuthRuntimePolicy = {},
) {
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
      oauthProvider({
        allowDynamicClientRegistration: config.allowDynamicClientRegistration,
        consentPage: "/consent",
        clientPrivileges: ({ user }) =>
          user ? (policy.isSuperuser?.(user.id) ?? false) : false,
        clientReference: () => DASHBOARD_CLIENT_REFERENCE,
        generateClientId: () => createIdentifier("chikara_"),
        loginPage: "/sign-in",
        prefix: {
          clientSecret: "chikara_cs_",
          opaqueAccessToken: "chikara_at_",
          refreshToken: "chikara_rt_",
        },
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
