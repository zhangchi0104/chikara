import { Effect } from "effect";
import type { AuthEventType } from "./auth-audit/auth-audit.models.js";
import { recordAuthEvent } from "./auth-audit/auth-audit.store.js";
import { runtimePromise } from "./auth-runtime.effect.js";

export type TwoFactorState =
  | "disabled"
  | "pending"
  | "enabled"
  | "inconsistent";

type AccountProtectionOperation =
  | "disable-two-factor"
  | "email-sign-in"
  | "enable-two-factor"
  | "regenerate-recovery-codes"
  | "verify-totp"
  | "other";

interface TwoFactorSnapshot {
  readonly factorCount: number;
  readonly twoFactorEnabled: number;
  readonly verifiedCount: number;
}

export interface AccountProtectionAuthAdapter {
  readonly forward: (request: Request) => Effect.Effect<Response, Error>;
  readonly sessionUserId: (
    request: Request,
  ) => Effect.Effect<string | undefined, Error>;
}

export interface AccountProtectionRequestPorts {
  readonly database: D1Database;
  readonly openAuth: Effect.Effect<AccountProtectionAuthAdapter, Error>;
  readonly serialize: (
    userId: string,
    request: Request,
  ) => Effect.Effect<Response, Error>;
}

export interface CoordinatedAccountProtectionPorts {
  readonly database: D1Database;
  readonly forward: (request: Request) => Effect.Effect<Response, Error>;
  readonly userId: string;
}

interface EnrollmentConflict {
  readonly code: string;
  readonly message: string;
}

const enrollmentConflicts: Record<
  Exclude<TwoFactorState, "disabled">,
  EnrollmentConflict
> = {
  enabled: {
    code: "TWO_FACTOR_ALREADY_ENABLED",
    message: "Two-factor authentication is already enabled.",
  },
  inconsistent: {
    code: "TWO_FACTOR_REPAIR_REQUIRED",
    message:
      "Two-factor authentication needs to be reset before setup can continue.",
  },
  pending: {
    code: "TWO_FACTOR_SETUP_PENDING",
    message:
      "An authenticator setup is already in progress. Restart it from your profile.",
  },
};

function operationFor(request: Request): AccountProtectionOperation {
  if (request.method !== "POST") return "other";
  switch (new URL(request.url).pathname) {
    case "/api/auth/sign-in/email":
      return "email-sign-in";
    case "/api/auth/two-factor/disable":
      return "disable-two-factor";
    case "/api/auth/two-factor/enable":
      return "enable-two-factor";
    case "/api/auth/two-factor/generate-backup-codes":
      return "regenerate-recovery-codes";
    case "/api/auth/two-factor/verify-totp":
      return "verify-totp";
    default:
      return "other";
  }
}

function isMutation(operation: AccountProtectionOperation): boolean {
  return operation !== "email-sign-in" && operation !== "other";
}

function classify(snapshot: TwoFactorSnapshot | null): TwoFactorState {
  if (!snapshot) return "inconsistent";
  const { factorCount, twoFactorEnabled, verifiedCount } = snapshot;
  if (twoFactorEnabled === 0 && factorCount === 0) return "disabled";
  if (twoFactorEnabled === 0 && factorCount === 1 && verifiedCount === 0) {
    return "pending";
  }
  if (twoFactorEnabled === 1 && factorCount === 1 && verifiedCount === 1) {
    return "enabled";
  }
  return "inconsistent";
}

function promiseEffect<A>(task: () => Promise<A>) {
  return runtimePromise("account protection", task);
}

function readSnapshot(database: D1Database, userId: string) {
  return promiseEffect(() =>
    database
      .prepare(
        `SELECT
           COALESCE(u."twoFactorEnabled", 0) AS "twoFactorEnabled",
           COUNT(t."id") AS "factorCount",
           COALESCE(SUM(
             CASE
               WHEN t."id" IS NOT NULL AND t."verified" = 1
               THEN 1 ELSE 0
             END
           ), 0) AS "verifiedCount"
         FROM "user" u
         LEFT JOIN "twoFactor" t ON t."userId" = u."id"
         WHERE u."id" = ?
         GROUP BY u."id", u."twoFactorEnabled"`,
      )
      .bind(userId)
      .first<TwoFactorSnapshot>(),
  );
}

export function readTwoFactorState(database: D1Database, userId: string) {
  return readSnapshot(database, userId).pipe(Effect.map(classify));
}

function isAutoRecoverable(database: D1Database, userId: string) {
  return readSnapshot(database, userId).pipe(
    Effect.map(
      (snapshot) =>
        Number(snapshot?.twoFactorEnabled) === 1 &&
        Number(snapshot?.verifiedCount) === 0,
    ),
  );
}

function jsonEmail(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || !("email" in value)) {
    return undefined;
  }
  return typeof value.email === "string" && value.email.trim()
    ? value.email.trim()
    : undefined;
}

function signInEmail(request: Request) {
  return promiseEffect(async () => {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return jsonEmail(
        await request
          .clone()
          .json()
          .catch(() => undefined),
      );
    }
    const form = await request
      .clone()
      .formData()
      .catch(() => undefined);
    const email = form?.get("email");
    return typeof email === "string" && email.trim() ? email.trim() : undefined;
  });
}

function recoverableSignInUserId(request: Request, database: D1Database) {
  return Effect.gen(function* () {
    const email = yield* signInEmail(request);
    if (!email) return undefined;
    const user = yield* promiseEffect(() =>
      database
        .prepare('SELECT "id" FROM "user" WHERE "email" = ?')
        .bind(email.toLowerCase())
        .first<{ id: string }>(),
    );
    if (!user || !(yield* isAutoRecoverable(database, user.id))) {
      return undefined;
    }
    return user.id;
  });
}

export function handleAccountProtectionRequest(
  request: Request,
  ports: AccountProtectionRequestPorts,
) {
  return Effect.gen(function* () {
    const operation = operationFor(request);
    if (operation === "email-sign-in") {
      const recoveryUserId = yield* recoverableSignInUserId(
        request,
        ports.database,
      );
      if (recoveryUserId) {
        return yield* ports.serialize(recoveryUserId, request);
      }
    }

    const auth = yield* ports.openAuth;
    if (!isMutation(operation)) return yield* auth.forward(request);
    const userId = yield* auth.sessionUserId(request);
    if (userId) return yield* ports.serialize(userId, request);
    return yield* auth.forward(request);
  });
}

function requiresTwoFactor(response: Response) {
  if (!response.ok) return Effect.succeed(false);
  return promiseEffect<unknown>(() =>
    response
      .clone()
      .json()
      .catch(() => undefined),
  ).pipe(
    Effect.map(
      (value) =>
        value !== null &&
        typeof value === "object" &&
        "twoFactorRedirect" in value &&
        value.twoFactorRedirect === true,
    ),
  );
}

function resetBrokenTwoFactor(database: D1Database, userId: string) {
  return promiseEffect(() =>
    database.batch([
      database
        .prepare('UPDATE "user" SET "twoFactorEnabled" = 0 WHERE "id" = ?')
        .bind(userId),
      database
        .prepare('DELETE FROM "twoFactor" WHERE "userId" = ?')
        .bind(userId),
    ]),
  ).pipe(Effect.asVoid);
}

function mutationEvent(
  operation: AccountProtectionOperation,
  before: TwoFactorState,
  after: TwoFactorState,
): AuthEventType | undefined {
  switch (operation) {
    case "enable-two-factor":
      return before === "disabled" && after === "pending"
        ? "two_factor.setup_started"
        : undefined;
    case "verify-totp":
      return before === "pending" && after === "enabled"
        ? "two_factor.enabled"
        : undefined;
    case "disable-two-factor":
      if (after !== "disabled") return undefined;
      if (before === "enabled") return "two_factor.disabled";
      return before === "pending" || before === "inconsistent"
        ? "two_factor.setup_reset"
        : undefined;
    case "regenerate-recovery-codes":
      return before === "enabled" && after === "enabled"
        ? "two_factor.recovery_codes_regenerated"
        : undefined;
    default:
      return undefined;
  }
}

function enrollmentConflict(state: TwoFactorState): Response | undefined {
  if (state === "disabled") return undefined;
  const { code, message } = enrollmentConflicts[state];
  return Response.json({ code, message }, { status: 409 });
}

export function coordinateAccountProtectionRequest(
  request: Request,
  ports: CoordinatedAccountProtectionPorts,
) {
  return Effect.gen(function* () {
    const operation = operationFor(request);
    if (operation === "email-sign-in") {
      if (!(yield* isAutoRecoverable(ports.database, ports.userId))) {
        return yield* ports.forward(request);
      }
      const authenticated = yield* ports.forward(request.clone());
      if (!(yield* requiresTwoFactor(authenticated))) return authenticated;
      if (!(yield* isAutoRecoverable(ports.database, ports.userId))) {
        return authenticated;
      }
      yield* resetBrokenTwoFactor(ports.database, ports.userId);
      yield* recordAuthEvent(ports.database, {
        eventType: "two_factor.auto_repaired",
        subjectUserId: ports.userId,
      });
      return yield* ports.forward(request);
    }

    const before = yield* readTwoFactorState(ports.database, ports.userId);
    if (operation === "enable-two-factor") {
      const conflict = enrollmentConflict(before);
      if (conflict) return conflict;
    }
    const response = yield* ports.forward(request);
    if (!response.ok) return response;
    const after = yield* readTwoFactorState(ports.database, ports.userId);
    const eventType = mutationEvent(operation, before, after);
    if (eventType) {
      yield* recordAuthEvent(ports.database, {
        actorUserId: ports.userId,
        eventType,
        subjectUserId: ports.userId,
      });
    }
    return response;
  });
}
