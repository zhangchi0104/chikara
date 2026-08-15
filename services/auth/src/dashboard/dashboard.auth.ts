import { hashPassword } from "better-auth/crypto";
import { createAuth } from "../auth.js";
import type { AuthBindings } from "../configs/auth.config.js";
import { isSuperuserId } from "./dashboard.access.js";
import { digest } from "./dashboard.crypto.js";
import { DashboardError } from "./dashboard.error.js";
import type { Superuser } from "./dashboard.models.js";

export const BOOTSTRAP_KEY = "dashboard:bootstrap";

interface BootstrapRecord {
  readonly digest: string;
}

interface SessionResult {
  readonly user: {
    readonly email: string;
    readonly id: string;
    readonly name: string;
  };
}

function isBootstrapRecord(value: object): value is BootstrapRecord {
  return "digest" in value && typeof value.digest === "string";
}

export async function isBootstrapped(database: D1Database): Promise<boolean> {
  const row = await database
    .prepare("SELECT userId FROM dashboardSuperuser WHERE singleton = 1")
    .first<{ userId: string }>();
  return row !== null;
}

export async function requireSuperuser(
  request: Request,
  bindings: AuthBindings,
): Promise<Superuser> {
  const session = await (await createAuth(bindings)).api.getSession({
    headers: request.headers,
  });
  if (!session) throw new DashboardError(401, "Sign in to continue.");
  const current = session as SessionResult;
  if (!(await isSuperuserId(bindings.AUTH_DB, current.user.id))) {
    throw new DashboardError(403, "Superuser access is required.");
  }
  return current.user;
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
