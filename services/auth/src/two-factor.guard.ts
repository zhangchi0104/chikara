import {
  isTwoFactorAutoRecoverable,
  readTwoFactorState,
  type TwoFactorState,
} from "./two-factor.state.js";

const coordinatedPaths = new Set([
  "/api/auth/two-factor/disable",
  "/api/auth/two-factor/enable",
  "/api/auth/two-factor/generate-backup-codes",
  "/api/auth/two-factor/verify-totp",
]);

const emailSignInPath = "/api/auth/sign-in/email";

function conflict(code: string, message: string): Response {
  return Response.json({ code, message }, { status: 409 });
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

export function coordinatesTwoFactorMutation(request: Request): boolean {
  return (
    request.method === "POST" &&
    coordinatedPaths.has(new URL(request.url).pathname)
  );
}

export function isEmailSignInRequest(request: Request): boolean {
  return (
    request.method === "POST" &&
    new URL(request.url).pathname === emailSignInPath
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

async function signInEmail(request: Request): Promise<string | undefined> {
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
}

export async function recoverableSignInUserId(
  request: Request,
  database: D1Database,
): Promise<string | undefined> {
  if (!isEmailSignInRequest(request)) return undefined;
  const email = await signInEmail(request);
  if (!email) return undefined;
  const user = await database
    .prepare('SELECT "id" FROM "user" WHERE "email" = ?')
    .bind(email.toLowerCase())
    .first<{ id: string }>();
  if (!user) return undefined;
  return (await isTwoFactorAutoRecoverable(database, user.id))
    ? user.id
    : undefined;
}

export async function rejectUnsafeEnrollment(
  request: Request,
  database: D1Database,
  userId: string,
): Promise<Response | undefined> {
  const path = new URL(request.url).pathname;
  if (path !== "/api/auth/two-factor/enable") return undefined;
  const state = await readTwoFactorState(database, userId);
  if (state === "disabled") return undefined;
  const { code, message } = enrollmentConflicts[state];
  return conflict(code, message);
}
