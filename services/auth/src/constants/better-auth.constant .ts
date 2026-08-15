import { oauthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthOptions } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Redacted } from "effect";
import type { AuthConfig } from "../configs/auth.config.js";

export const AUTH_BASE_PATH = "/api/auth";

export function createAuthOptions(config: AuthConfig): BetterAuthOptions {
  return {
    appName: "Chikara",
    basePath: AUTH_BASE_PATH,
    baseURL: config.baseUrl,
    disabledPaths: ["/token"],
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      jwt(),
      oauthProvider({
        allowDynamicClientRegistration: config.allowDynamicClientRegistration,
        consentPage: "/consent",
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
        signUp: {
          page: "/sign-up",
        },
      }),
    ],
    secret: Redacted.value(config.secret),
    trustedOrigins: [...config.trustedOrigins],
  };
}
