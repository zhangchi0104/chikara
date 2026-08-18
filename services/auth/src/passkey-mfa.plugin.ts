import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { deleteSessionCookie, expireCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { Clock, DateTime, Effect } from "effect";
import { AuthRuntimeError } from "./auth-runtime.error.js";

const challengeMaxAgeSeconds = 600;
const twoFactorCookieName = "two_factor";

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

function promiseEffect<A>(task: () => Promise<A>) {
  return Effect.tryPromise({
    catch: (cause) =>
      cause instanceof APIError
        ? cause
        : new AuthRuntimeError({ cause, operation: "passkey MFA" }),
    try: task,
  });
}

export const passkeyChallengeExpiresAt = Effect.fn(
  "PasskeyMfa.challengeExpiresAt",
)(function* () {
  const now = yield* DateTime.now;
  return now.pipe(
    DateTime.addDuration(challengeMaxAgeSeconds * 1_000),
    DateTime.toDateUtc,
  );
});

export const isPasskeyChallengeExpired = Effect.fn(
  "PasskeyMfa.isChallengeExpired",
)(function* (expiresAt: Date) {
  const now = yield* Clock.currentTimeMillis;
  return expiresAt.getTime() <= now;
});

function pendingChallenge(context: GenericEndpointContext) {
  return Effect.gen(function* () {
    const cookie = context.context.createAuthCookie(twoFactorCookieName);
    const identifier = yield* promiseEffect(() =>
      context.getSignedCookie(cookie.name, context.context.secret),
    );
    if (!identifier) return undefined;
    const verification = yield* promiseEffect(() =>
      context.context.internalAdapter.findVerificationValue(identifier),
    );
    if (
      !verification ||
      (yield* isPasskeyChallengeExpired(verification.expiresAt))
    ) {
      return yield* Effect.fail(invalidChallenge());
    }
    return { identifier, userId: verification.value };
  });
}

export function assertPasskeyUserVerification(userVerified: boolean): void {
  if (userVerified) return;
  throw APIError.from("UNAUTHORIZED", {
    code: "PASSKEY_USER_VERIFICATION_REQUIRED",
    message: "Verify the passkey with your device PIN or biometrics.",
  });
}

export function assertPasskeyMfaCredential(
  context: GenericEndpointContext,
  credentialId: string,
  userVerified: boolean,
) {
  return Effect.gen(function* () {
    const challenge = yield* pendingChallenge(context);
    if (!challenge) {
      assertPasskeyUserVerification(userVerified);
      return;
    }
    const passkey = yield* promiseEffect(() =>
      context.context.adapter.findOne<PasskeyOwner>({
        model: "passkey",
        where: [{ field: "credentialID", value: credentialId }],
      }),
    );
    if (!passkey || passkey.userId !== challenge.userId) {
      return yield* Effect.fail(
        APIError.from("UNAUTHORIZED", {
          code: "PASSKEY_ACCOUNT_MISMATCH",
          message: "Use a passkey registered to the account being verified.",
        }),
      );
    }
    const consumed = yield* promiseEffect(() =>
      context.context.internalAdapter.consumeVerificationValue(
        challenge.identifier,
      ),
    );
    if (
      !consumed ||
      consumed.value !== challenge.userId ||
      (yield* isPasskeyChallengeExpired(consumed.expiresAt))
    ) {
      return yield* Effect.fail(invalidChallenge());
    }
    yield* promiseEffect(() =>
      context.context.internalAdapter.consumeVerificationValue(
        `2fa-attempts-${challenge.identifier}`,
      ),
    ).pipe(Effect.catch(() => Effect.void));
    expireCookie(
      context,
      context.context.createAuthCookie(twoFactorCookieName),
    );
  });
}

function userPasskeys(context: GenericEndpointContext, userId: string) {
  return promiseEffect(() =>
    context.context.adapter.findMany<StoredPasskey>({
      model: "passkey",
      where: [{ field: "userId", value: userId }],
    }),
  );
}

function twoFactorEnrollment(context: GenericEndpointContext, userId: string) {
  return Effect.all(
    [
      promiseEffect(() =>
        context.context.adapter.findOne<StoredUser>({
          model: "user",
          where: [{ field: "id", value: userId }],
        }),
      ),
      promiseEffect(() =>
        context.context.adapter.findOne<StoredTwoFactor>({
          model: "twoFactor",
          where: [{ field: "userId", value: userId }],
        }),
      ),
    ],
    { concurrency: "unbounded" },
  );
}

function enrolledMethods(context: GenericEndpointContext, userId: string) {
  return Effect.gen(function* () {
    const [passkeys, [user, factor]] = yield* Effect.all(
      [userPasskeys(context, userId), twoFactorEnrollment(context, userId)],
      { concurrency: "unbounded" },
    );
    const methods: TwoFactorMethod[] = [];
    if (passkeys.length > 0) methods.push("passkey");
    if (user?.twoFactorEnabled && factor?.verified === true) {
      methods.push("totp");
    }
    return methods;
  });
}

function passkeyMfaMethods(context: GenericEndpointContext) {
  return Effect.gen(function* () {
    const challenge = yield* pendingChallenge(context);
    if (!challenge) return yield* Effect.fail(invalidChallenge());
    const methods = yield* enrolledMethods(context, challenge.userId);
    if (methods.length === 0) return yield* Effect.fail(invalidChallenge());
    return context.json({
      twoFactorMethods: methods,
      twoFactorRedirect: true,
    });
  });
}

function guardAuthenticatorVerification(context: GenericEndpointContext) {
  return Effect.gen(function* () {
    if (yield* promiseEffect(() => getSessionFromCtx(context))) return;
    const challenge = yield* pendingChallenge(context);
    if (!challenge) return;
    const [user, factor] = yield* twoFactorEnrollment(
      context,
      challenge.userId,
    );
    if (user?.twoFactorEnabled && factor?.verified === true) return;
    const recovery = context.path.endsWith("verify-backup-code");
    return yield* Effect.fail(
      APIError.from("UNAUTHORIZED", {
        code: recovery
          ? "TWO_FACTOR_RECOVERY_NOT_ENROLLED"
          : "TWO_FACTOR_TOTP_NOT_ENROLLED",
        message: recovery
          ? "Recovery codes are available only after authenticator setup is complete."
          : "Authenticator codes are available only after setup is complete.",
      }),
    );
  });
}

function beginPasskeyMfa(context: GenericEndpointContext) {
  return Effect.gen(function* () {
    const authenticated = context.context.newSession;
    if (!authenticated) return;
    const methods = yield* enrolledMethods(context, authenticated.user.id);
    if (!methods.includes("passkey")) return;

    deleteSessionCookie(context, true);
    yield* promiseEffect(() =>
      context.context.internalAdapter.deleteSession(
        authenticated.session.token,
      ),
    );
    context.context.setNewSession(null);

    const identifier = `2fa-${generateRandomString(20)}`;
    const expiresAt = yield* passkeyChallengeExpiresAt();
    yield* promiseEffect(() =>
      context.context.internalAdapter.createVerificationValue({
        expiresAt,
        identifier,
        value: authenticated.user.id,
      }),
    );
    yield* promiseEffect(() =>
      context.context.internalAdapter.createVerificationValue({
        expiresAt,
        identifier: `2fa-attempts-${identifier}`,
        value: "0",
      }),
    );
    const challengeCookie = context.context.createAuthCookie(
      twoFactorCookieName,
      { maxAge: challengeMaxAgeSeconds },
    );
    yield* promiseEffect(() =>
      context.setSignedCookie(
        challengeCookie.name,
        identifier,
        context.context.secret,
        challengeCookie.attributes,
      ),
    );

    return context.json({
      twoFactorMethods: methods,
      twoFactorRedirect: true,
    });
  });
}

function decoratePasskeyAuthentication(context: GenericEndpointContext) {
  return Effect.gen(function* () {
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
    const challenge = yield* pendingChallenge(context);
    if (!challenge) {
      return context.json({
        ...returned,
        userVerification: "required",
      });
    }
    const passkeys = yield* userPasskeys(context, challenge.userId);
    if (passkeys.length === 0) return yield* Effect.fail(invalidChallenge());
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
  });
}

export function createPasskeyMfaPlugin(): BetterAuthPlugin {
  return {
    endpoints: {
      passkeyMfaMethods: createAuthEndpoint(
        "/two-factor/methods",
        { method: "GET" },
        (context) => Effect.runPromise(passkeyMfaMethods(context)),
      ),
    },
    hooks: {
      before: [
        {
          handler: createAuthMiddleware((context) =>
            Effect.runPromise(guardAuthenticatorVerification(context)),
          ),
          matcher: ({ path }) =>
            path === "/two-factor/verify-backup-code" ||
            path === "/two-factor/verify-totp",
        },
      ],
      after: [
        {
          handler: createAuthMiddleware((context) =>
            Effect.runPromise(beginPasskeyMfa(context)),
          ),
          matcher: ({ path }) => path === "/sign-in/email",
        },
        {
          handler: createAuthMiddleware((context) =>
            Effect.runPromise(decoratePasskeyAuthentication(context)),
          ),
          matcher: ({ path }) =>
            path === "/passkey/generate-authenticate-options",
        },
      ],
    },
    id: "passkey-mfa",
  };
}
