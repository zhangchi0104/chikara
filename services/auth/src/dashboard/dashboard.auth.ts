import { hashPassword } from "better-auth/crypto";
import { createAuth } from "../auth.js";
import type { AuthBindings } from "../configs/auth.config.js";
import { readTwoFactorState } from "../two-factor.state.js";
import { isSuperuserId } from "./dashboard.access.js";
import { digest } from "./dashboard.crypto.js";
import { DashboardError } from "./dashboard.error.js";
import type { AccountSession, Superuser } from "./dashboard.models.js";

export const BOOTSTRAP_KEY = "dashboard:bootstrap";

interface BootstrapRecord {
  readonly digest: string;
}

function isBootstrapRecord(value: object): value is BootstrapRecord {
  return "digest" in value && typeof value.digest === "string";
}

function serializedDate(value: Date | number | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export async function isBootstrapped(database: D1Database): Promise<boolean> {
  const row = await database
    .prepare("SELECT userId FROM dashboardSuperuser WHERE singleton = 1")
    .first<{ userId: string }>();
  return row !== null;
}

export async function getAccountSession(
  request: Request,
  bindings: AuthBindings,
): Promise<AccountSession> {
  const session = await (await createAuth(bindings)).api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) throw new DashboardError(401, "Sign in to continue.");
  const [canManage, twoFactorState] = await Promise.all([
    isSuperuserId(bindings.AUTH_DB, session.user.id),
    readTwoFactorState(bindings.AUTH_DB, session.user.id),
  ]);
  return {
    canManage,
    user: {
      createdAt: serializedDate(session.user.createdAt),
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      id: session.user.id,
      image: session.user.image ?? null,
      name: session.user.name,
      twoFactorState,
    },
  };
}

export async function requireSuperuser(
  request: Request,
  bindings: AuthBindings,
): Promise<Superuser> {
  const account = await getAccountSession(request, bindings);
  if (!account.canManage) {
    throw new DashboardError(403, "Superuser access is required.");
  }
  return account.user;
}

export interface BootstrapInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly token: string;
}

export async function bootstrapSuperuser(
  bindings: AuthBindings,
  input: BootstrapInput,
): Promise<Superuser> {
  if (await isBootstrapped(bindings.AUTH_DB)) {
    throw new DashboardError(409, "The superuser has already been created.");
  }
  const stored = await bindings.AUTH_BOOTSTRAP.get(BOOTSTRAP_KEY, "json");
  if (!stored || typeof stored !== "object" || !isBootstrapRecord(stored)) {
    throw new DashboardError(403, "The bootstrap token is missing or expired.");
  }
  const tokenDigest = await digest(input.token);
  if (tokenDigest !== stored.digest) {
    throw new DashboardError(403, "The bootstrap token is invalid.");
  }

  const now = Date.now();
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  await bindings.AUTH_DB.batch([
    bindings.AUTH_DB.prepare(
      "INSERT INTO dashboardBootstrap (digest, consumedAt) VALUES (?, ?)",
    ).bind(tokenDigest, now),
    bindings.AUTH_DB.prepare(
      'INSERT INTO "user" (id, name, email, emailVerified, image, createdAt, updatedAt, role, banned) VALUES (?, ?, ?, 1, NULL, ?, ?, "admin", 0)',
    ).bind(userId, input.name, input.email, now, now),
    bindings.AUTH_DB.prepare(
      'INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, "credential", ?, ?, ?, ?)',
    ).bind(accountId, userId, userId, passwordHash, now, now),
    bindings.AUTH_DB.prepare(
      "INSERT INTO dashboardSuperuser (singleton, userId, createdAt) VALUES (1, ?, ?)",
    ).bind(userId, now),
  ]).catch(() => {
    throw new DashboardError(
      409,
      "The token was already used or the email is already registered.",
    );
  });
  await bindings.AUTH_BOOTSTRAP.delete(BOOTSTRAP_KEY);
  return { email: input.email, id: userId, name: input.name };
}
