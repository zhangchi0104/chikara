import { APIError } from "better-auth";
import { Effect } from "effect";
import { createAuth } from "../auth.js";
import type { AuthEventCursor } from "../auth-audit/auth-audit.models.js";
import { listAuthEvents } from "../auth-audit/auth-audit.store.js";
import { AuthRuntimeError } from "../auth-runtime.error.js";
import {
  authOperation,
  storageEffect,
  storageOperation,
} from "./dashboard.effect.js";
import { DashboardError } from "./dashboard.error.js";
import type { DashboardUser, DashboardUserDetail } from "./dashboard.models.js";

interface UserRow extends Omit<DashboardUser, "emailVerified"> {
  readonly emailVerified: number;
}

interface UserProfileRow
  extends Omit<DashboardUserDetail["user"], "administrator" | "emailVerified"> {
  readonly administrator: number;
  readonly emailVerified: number;
}

function authRuntimeFailure(operation: string, cause: unknown) {
  return cause instanceof APIError
    ? cause
    : new AuthRuntimeError({ cause, operation });
}

function authApiEffect<A>(operation: string, task: () => Promise<A>) {
  return Effect.tryPromise({
    catch: (cause) => authRuntimeFailure(operation, cause),
    try: task,
  });
}

export function listUsers(database: D1Database) {
  return storageEffect("list users", async () => {
    const result = await database
      .prepare(
        `SELECT u.id, u.name, u.email, u.emailVerified, u.createdAt,
         COUNT(s.id) AS sessionCount
         FROM "user" u LEFT JOIN session s ON s.userId = u.id
         GROUP BY u.id ORDER BY u.createdAt DESC`,
      )
      .all<UserRow>();
    return result.results.map((row) => ({
      ...row,
      emailVerified: Boolean(row.emailVerified),
    }));
  });
}

export function getUserDetail(
  database: D1Database,
  userId: string,
  cursor?: AuthEventCursor,
) {
  return Effect.gen(function* () {
    const row = yield* storageEffect("read user profile", () =>
      database
        .prepare(
          `SELECT u.id, u.name, u.email, u.image, u.emailVerified, u.createdAt,
           (SELECT COUNT(*) FROM session s WHERE s.userId = u.id) AS sessionCount,
           EXISTS(
             SELECT 1 FROM dashboardSuperuser superuser
             WHERE superuser.userId = u.id
           ) AS administrator
           FROM "user" u WHERE u.id = ?`,
        )
        .bind(userId)
        .first<UserProfileRow>(),
    );
    if (!row) {
      return yield* new DashboardError({
        message: "User not found.",
        status: 404,
      });
    }
    const activity = yield* storageOperation(
      "read user profile",
      listAuthEvents(database, userId, cursor),
    );
    return {
      activity,
      user: {
        ...row,
        administrator: Boolean(row.administrator),
        emailVerified: Boolean(row.emailVerified),
      },
    } satisfies DashboardUserDetail;
  });
}

export interface CreateUserInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

export function createUser(headers: Headers, input: CreateUserInput) {
  return authOperation(
    "create user",
    409,
    "A user with this email already exists.",
    Effect.gen(function* () {
      const auth = yield* createAuth();
      const result = yield* authApiEffect("create user", () =>
        auth.api.createUser({ headers, body: input }),
      );
      return {
        createdAt: result.user.createdAt.getTime(),
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        id: result.user.id,
        name: result.user.name,
        sessionCount: 0,
      } satisfies DashboardUser;
    }),
  );
}

export function updateUser(
  headers: Headers,
  userId: string,
  input: { readonly email: string; readonly name: string },
) {
  return authOperation(
    "update user",
    409,
    "The user could not be updated; verify the email is unique.",
    Effect.gen(function* () {
      const auth = yield* createAuth();
      yield* authApiEffect("update user", () =>
        auth.api.adminUpdateUser({
          headers,
          body: { data: input, userId },
        }),
      );
    }),
  );
}

export function removeUser(headers: Headers, userId: string) {
  return authOperation(
    "remove user",
    404,
    "User not found.",
    Effect.gen(function* () {
      const auth = yield* createAuth();
      yield* authApiEffect("remove user", () =>
        auth.api.removeUser({ headers, body: { userId } }),
      );
    }),
  );
}

export function revokeUserSessions(headers: Headers, userId: string) {
  return authOperation(
    "revoke user sessions",
    404,
    "User not found.",
    Effect.gen(function* () {
      const auth = yield* createAuth();
      yield* authApiEffect("revoke user sessions", () =>
        auth.api.revokeUserSessions({ headers, body: { userId } }),
      );
    }),
  );
}
