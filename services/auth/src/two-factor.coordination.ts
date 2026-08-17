import {
  isEmailSignInRequest,
  rejectUnsafeEnrollment,
} from "./two-factor.guard.js";
import { isTwoFactorAutoRecoverable } from "./two-factor.state.js";

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
    return forward(request);
  }

  const conflict = await rejectUnsafeEnrollment(request, database, userId);
  return conflict ?? forward(request);
}
