import type { AuthEventType } from "./auth-audit/auth-audit.models.js";
import { recordAuthEvent } from "./auth-audit/auth-audit.store.js";
import {
  isEmailSignInRequest,
  rejectUnsafeEnrollment,
} from "./two-factor.guard.js";
import {
  isTwoFactorAutoRecoverable,
  readTwoFactorState,
  type TwoFactorState,
} from "./two-factor.state.js";

export type CoordinatedAuthHandler = (request: Request) => Promise<Response>;

async function requiresTwoFactor(response: Response): Promise<boolean> {
  if (!response.ok) return false;
  const value: unknown = await response
    .clone()
    .json()
    .catch(() => undefined);
  return (
    value !== null &&
    typeof value === "object" &&
    "twoFactorRedirect" in value &&
    value.twoFactorRedirect === true
  );
}

async function resetBrokenTwoFactor(
  database: D1Database,
  userId: string,
): Promise<void> {
  await database.batch([
    database
      .prepare('UPDATE "user" SET "twoFactorEnabled" = 0 WHERE "id" = ?')
      .bind(userId),
    database.prepare('DELETE FROM "twoFactor" WHERE "userId" = ?').bind(userId),
  ]);
}

function mutationEvent(
  path: string,
  before: TwoFactorState,
  after: TwoFactorState,
): AuthEventType | undefined {
  switch (path) {
    case "/api/auth/two-factor/enable":
      return before === "disabled" && after === "pending"
        ? "two_factor.setup_started"
        : undefined;
    case "/api/auth/two-factor/verify-totp":
      return before === "pending" && after === "enabled"
        ? "two_factor.enabled"
        : undefined;
    case "/api/auth/two-factor/disable":
      if (after !== "disabled") return undefined;
      if (before === "enabled") return "two_factor.disabled";
      return before === "pending" || before === "inconsistent"
        ? "two_factor.setup_reset"
        : undefined;
    case "/api/auth/two-factor/generate-backup-codes":
      return before === "enabled" && after === "enabled"
        ? "two_factor.recovery_codes_regenerated"
        : undefined;
    default:
      return undefined;
  }
}

export async function coordinateTwoFactorRequest(
  request: Request,
  database: D1Database,
  userId: string,
  forward: CoordinatedAuthHandler,
): Promise<Response> {
  if (isEmailSignInRequest(request)) {
    if (!(await isTwoFactorAutoRecoverable(database, userId))) {
      return forward(request);
    }
    const authenticated = await forward(request.clone());
    if (!(await requiresTwoFactor(authenticated))) return authenticated;
    if (!(await isTwoFactorAutoRecoverable(database, userId))) {
      return authenticated;
    }
    await resetBrokenTwoFactor(database, userId);
    await recordAuthEvent(database, {
      eventType: "two_factor.auto_repaired",
      subjectUserId: userId,
    });
    return forward(request);
  }

  const before = await readTwoFactorState(database, userId);
  const conflict = await rejectUnsafeEnrollment(request, database, userId);
  if (conflict) return conflict;
  const response = await forward(request);
  if (!response.ok) return response;
  const after = await readTwoFactorState(database, userId);
  const eventType = mutationEvent(new URL(request.url).pathname, before, after);
  if (eventType) {
    await recordAuthEvent(database, {
      actorUserId: userId,
      eventType,
      subjectUserId: userId,
    });
  }
  return response;
}
