import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { deleteSessionCookie, expireCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";

const challengeMaxAgeSeconds = 600;
const twoFactorCookieName = "two_factor";

interface PendingChallenge {
  readonly identifier: string;
  readonly userId: string;
}

interface StoredPasskey {
  readonly credentialID: string;
  readonly transports?: string;
}

interface PasskeyOwner {
  readonly userId: string;
}

interface StoredTwoFactor {
  readonly verified?: boolean | null;
}

interface StoredUser {
  readonly twoFactorEnabled?: boolean | null;
}

type TwoFactorMethod = "passkey" | "totp";

function invalidChallenge(): APIError {
  return APIError.from("UNAUTHORIZED", {
    code: "INVALID_TWO_FACTOR_COOKIE",
    message: "The sign-in challenge is missing or has expired.",
  });
}

async function pendingChallenge(
  context: GenericEndpointContext,
): Promise<PendingChallenge | undefined> {
  const cookie = context.context.createAuthCookie(twoFactorCookieName);
  const identifier = await context.getSignedCookie(
    cookie.name,
    context.context.secret,
  );
  if (!identifier) return undefined;
  const verification =
    await context.context.internalAdapter.findVerificationValue(identifier);
  if (!verification || verification.expiresAt <= new Date()) {
    throw invalidChallenge();
  }
  return { identifier, userId: verification.value };
}

export function assertPasskeyUserVerification(userVerified: boolean): void {
  if (userVerified) return;
  throw APIError.from("UNAUTHORIZED", {
    code: "PASSKEY_USER_VERIFICATION_REQUIRED",
    message: "Verify the passkey with your device PIN or biometrics.",
  });
}

export async function assertPasskeyMfaCredential(
  context: GenericEndpointContext,
  credentialId: string,
  userVerified: boolean,
): Promise<void> {
  const challenge = await pendingChallenge(context);
  if (!challenge) {
    assertPasskeyUserVerification(userVerified);
    return;
  }
  const passkey = await context.context.adapter.findOne<PasskeyOwner>({
    model: "passkey",
    where: [{ field: "credentialID", value: credentialId }],
  });
  if (!passkey || passkey.userId !== challenge.userId) {
    throw APIError.from("UNAUTHORIZED", {
      code: "PASSKEY_ACCOUNT_MISMATCH",
      message: "Use a passkey registered to the account being verified.",
    });
  }
  const consumed =
    await context.context.internalAdapter.consumeVerificationValue(
      challenge.identifier,
    );
  if (
    !consumed ||
    consumed.value !== challenge.userId ||
    consumed.expiresAt <= new Date()
  ) {
    throw invalidChallenge();
  }
  await context.context.internalAdapter
    .consumeVerificationValue(`2fa-attempts-${challenge.identifier}`)
    .catch(() => null);
  expireCookie(context, context.context.createAuthCookie(twoFactorCookieName));
}

async function userPasskeys(
  context: GenericEndpointContext,
  userId: string,
): Promise<ReadonlyArray<StoredPasskey>> {
  return context.context.adapter.findMany<StoredPasskey>({
    model: "passkey",
    where: [{ field: "userId", value: userId }],
  });
}

async function enrolledMethods(
  context: GenericEndpointContext,
  userId: string,
): Promise<ReadonlyArray<TwoFactorMethod>> {
  const [passkeys, user, factor] = await Promise.all([
    userPasskeys(context, userId),
    context.context.adapter.findOne<StoredUser>({
      model: "user",
      where: [{ field: "id", value: userId }],
    }),
    context.context.adapter.findOne<StoredTwoFactor>({
      model: "twoFactor",
      where: [{ field: "userId", value: userId }],
    }),
  ]);
  const methods: TwoFactorMethod[] = [];
  if (passkeys.length > 0) methods.push("passkey");
  if (user?.twoFactorEnabled && factor?.verified === true) {
    methods.push("totp");
  }
  return methods;
}

export function createPasskeyMfaPlugin(): BetterAuthPlugin {
  return {
    endpoints: {
      passkeyMfaMethods: createAuthEndpoint(
        "/two-factor/methods",
        { method: "GET" },
        async (context) => {
          const challenge = await pendingChallenge(context);
          if (!challenge) throw invalidChallenge();
          const methods = await enrolledMethods(context, challenge.userId);
          if (methods.length === 0) throw invalidChallenge();
          return context.json({
            twoFactorMethods: methods,
            twoFactorRedirect: true,
          });
        },
      ),
    },
    hooks: {
      before: [
        {
          handler: createAuthMiddleware(async (context) => {
            if (await getSessionFromCtx(context)) return;
            const challenge = await pendingChallenge(context);
            if (!challenge) return;
            const [user, factor] = await Promise.all([
              context.context.adapter.findOne<StoredUser>({
                model: "user",
                where: [{ field: "id", value: challenge.userId }],
              }),
              context.context.adapter.findOne<StoredTwoFactor>({
                model: "twoFactor",
                where: [{ field: "userId", value: challenge.userId }],
              }),
            ]);
            if (user?.twoFactorEnabled && factor?.verified === true) {
              return;
            }
            const recovery = context.path.endsWith("verify-backup-code");
            throw APIError.from("UNAUTHORIZED", {
              code: recovery
                ? "TWO_FACTOR_RECOVERY_NOT_ENROLLED"
                : "TWO_FACTOR_TOTP_NOT_ENROLLED",
              message: recovery
                ? "Recovery codes are available only after authenticator setup is complete."
                : "Authenticator codes are available only after setup is complete.",
            });
          }),
          matcher: ({ path }) =>
            path === "/two-factor/verify-backup-code" ||
            path === "/two-factor/verify-totp",
        },
      ],
      after: [
        {
          handler: createAuthMiddleware(async (context) => {
            const authenticated = context.context.newSession;
            if (!authenticated) return;
            const methods = await enrolledMethods(
              context,
              authenticated.user.id,
            );
            if (!methods.includes("passkey")) return;

            deleteSessionCookie(context, true);
            await context.context.internalAdapter.deleteSession(
              authenticated.session.token,
            );
            context.context.setNewSession(null);

            const identifier = `2fa-${generateRandomString(20)}`;
            const expiresAt = new Date(
              Date.now() + challengeMaxAgeSeconds * 1_000,
            );
            await context.context.internalAdapter.createVerificationValue({
              expiresAt,
              identifier,
              value: authenticated.user.id,
            });
            await context.context.internalAdapter.createVerificationValue({
              expiresAt,
              identifier: `2fa-attempts-${identifier}`,
              value: "0",
            });
            const challengeCookie = context.context.createAuthCookie(
              twoFactorCookieName,
              { maxAge: challengeMaxAgeSeconds },
            );
            await context.setSignedCookie(
              challengeCookie.name,
              identifier,
              context.context.secret,
              challengeCookie.attributes,
            );

            return context.json({
              twoFactorMethods: methods,
              twoFactorRedirect: true,
            });
          }),
          matcher: ({ path }) => path === "/sign-in/email",
        },
        {
          handler: createAuthMiddleware(async (context) => {
            const returned = context.context.returned;
            if (
              returned === null ||
              typeof returned !== "object" ||
              returned instanceof Response ||
              returned instanceof APIError ||
              Array.isArray(returned)
            ) {
              return;
            }
            const challenge = await pendingChallenge(context);
            if (!challenge) {
              return context.json({
                ...returned,
                userVerification: "required",
              });
            }
            const passkeys = await userPasskeys(context, challenge.userId);
            if (passkeys.length === 0) throw invalidChallenge();
            return context.json({
              ...returned,
              allowCredentials: passkeys.map((passkey) => ({
                id: passkey.credentialID,
                transports:
                  typeof passkey.transports === "string"
                    ? passkey.transports.split(",").filter(Boolean)
                    : undefined,
                type: "public-key",
              })),
              userVerification: "preferred",
            });
          }),
          matcher: ({ path }) =>
            path === "/passkey/generate-authenticate-options",
        },
      ],
    },
    id: "passkey-mfa",
  };
}
