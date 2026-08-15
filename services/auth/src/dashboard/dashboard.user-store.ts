import { createAuth } from "../auth.js";
import type { AuthBindings } from "../configs/auth.config.js";
import { authEffect, storageEffect } from "./dashboard.effect.js";
import type { DashboardUser } from "./dashboard.models.js";

interface UserRow extends Omit<DashboardUser, "emailVerified"> {
  readonly emailVerified: number;
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

export interface CreateUserInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

export function createUser(
  bindings: AuthBindings,
  headers: Headers,
  input: CreateUserInput,
) {
  return authEffect(
    "create user",
    409,
    "A user with this email already exists.",
    async () => {
      const auth = await createAuth(bindings);
      const result = await auth.api.createUser({ headers, body: input });
      return {
        createdAt: result.user.createdAt.getTime(),
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        id: result.user.id,
        name: result.user.name,
        sessionCount: 0,
      } satisfies DashboardUser;
    },
  );
}

export function updateUser(
  bindings: AuthBindings,
  headers: Headers,
  userId: string,
  input: { readonly email: string; readonly name: string },
) {
  return authEffect(
    "update user",
    409,
    "The user could not be updated; verify the email is unique.",
    async () => {
      const auth = await createAuth(bindings);
      await auth.api.adminUpdateUser({
        headers,
        body: { data: input, userId },
      });
    },
  );
}

export function removeUser(
  bindings: AuthBindings,
  headers: Headers,
  userId: string,
) {
  return authEffect("remove user", 404, "User not found.", async () => {
    const auth = await createAuth(bindings);
    await auth.api.removeUser({ headers, body: { userId } });
  });
}

export function revokeUserSessions(
  bindings: AuthBindings,
  headers: Headers,
  userId: string,
) {
  return authEffect(
    "revoke user sessions",
    404,
    "User not found.",
    async () => {
      const auth = await createAuth(bindings);
      await auth.api.revokeUserSessions({ headers, body: { userId } });
    },
  );
}
