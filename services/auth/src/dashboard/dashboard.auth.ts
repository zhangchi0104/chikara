import { hashPassword } from "better-auth/crypto";
import { Clock, DateTime, Effect } from "effect";
import { readTwoFactorState } from "../account-protection.js";
import { createAuth } from "../auth.js";
import { prepareAuthEventInsert } from "../auth-audit/auth-audit.store.js";
import type { AuthBindings } from "../configs/auth.config.js";
import { digest } from "./dashboard.crypto.js";
import { storageEffect, storageOperation } from "./dashboard.effect.js";
import { DashboardError } from "./dashboard.error.js";
import type { AccountSession } from "./dashboard.models.js";
import { isSuperuserId } from "./dashboard.superuser.js";

export const BOOTSTRAP_KEY = "dashboard:bootstrap";

interface BootstrapRecord {
  readonly digest: string;
}

function isBootstrapRecord(value: object): value is BootstrapRecord {
  return "digest" in value && typeof value.digest === "string";
}

function serializedDate(value: Date | number | string): string {
  let timestamp: number;
  if (value instanceof Date) {
    timestamp = value.getTime();
  } else if (typeof value === "number") {
    timestamp = value;
  } else {
    timestamp = Date.parse(value);
  }
  return DateTime.makeUnsafe(timestamp).pipe(DateTime.formatIso);
}

export function isBootstrapped(database: D1Database) {
  return storageEffect("read bootstrap status", () =>
    database
      .prepare("SELECT userId FROM dashboardSuperuser WHERE singleton = 1")
      .first<{ userId: string }>(),
  ).pipe(Effect.map((row) => row !== null));
}

export function getAccountSession(request: Request, bindings: AuthBindings) {
  return Effect.gen(function* () {
    const auth = yield* storageOperation("create auth runtime", createAuth());
    const session = yield* storageEffect("read account session", () =>
      auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true, disableRefresh: true },
      }),
    );
    if (!session) {
      return yield* new DashboardError({
        message: "Sign in to continue.",
        status: 401,
      });
    }
    const [canManage, passkeys, twoFactorState] = yield* Effect.all(
      [
        storageOperation(
          "read account permissions",
          isSuperuserId(bindings.AUTH_DB, session.user.id),
        ),
        storageEffect("count account passkeys", () =>
          bindings.AUTH_DB.prepare(
            'SELECT COUNT(*) AS "count" FROM "passkey" WHERE "userId" = ?',
          )
            .bind(session.user.id)
            .first<{ count: number }>(),
        ),
        storageOperation(
          "read two-factor state",
          readTwoFactorState(bindings.AUTH_DB, session.user.id),
        ),
      ],
      { concurrency: "unbounded" },
    );
    return {
      canManage,
      user: {
        createdAt: serializedDate(session.user.createdAt),
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        id: session.user.id,
        image: session.user.image ?? null,
        name: session.user.name,
        passkeyCount: passkeys?.count ?? 0,
        twoFactorState,
      },
    } satisfies AccountSession;
  });
}

export function requireSuperuser(request: Request, bindings: AuthBindings) {
  return Effect.gen(function* () {
    const account = yield* getAccountSession(request, bindings);
    if (!account.canManage) {
      return yield* new DashboardError({
        message: "Superuser access is required.",
        status: 403,
      });
    }
    return account.user;
  });
}

export interface BootstrapInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly token: string;
}

export function bootstrapSuperuser(
  bindings: AuthBindings,
  input: BootstrapInput,
) {
  return Effect.gen(function* () {
    if (yield* isBootstrapped(bindings.AUTH_DB)) {
      return yield* new DashboardError({
        message: "The superuser has already been created.",
        status: 409,
      });
    }
    const stored = yield* storageEffect("read bootstrap token", () =>
      bindings.AUTH_BOOTSTRAP.get(BOOTSTRAP_KEY, "json"),
    );
    if (!stored || typeof stored !== "object" || !isBootstrapRecord(stored)) {
      return yield* new DashboardError({
        message: "The bootstrap token is missing or expired.",
        status: 403,
      });
    }
    const tokenDigest = yield* storageOperation(
      "hash bootstrap token",
      digest(input.token),
    );
    if (tokenDigest !== stored.digest) {
      return yield* new DashboardError({
        message: "The bootstrap token is invalid.",
        status: 403,
      });
    }

    const now = yield* Clock.currentTimeMillis;
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const passwordHash = yield* storageEffect("hash bootstrap password", () =>
      hashPassword(input.password),
    );
    yield* Effect.tryPromise({
      catch: () =>
        new DashboardError({
          message:
            "The token was already used or the email is already registered.",
          status: 409,
        }),
      try: () =>
        bindings.AUTH_DB.batch([
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
          prepareAuthEventInsert(
            bindings.AUTH_DB,
            {
              eventType: "account.provisioned",
              subjectUserId: userId,
            },
            now,
          ),
        ]),
    });
    yield* storageEffect("consume bootstrap token", () =>
      bindings.AUTH_BOOTSTRAP.delete(BOOTSTRAP_KEY),
    );
    return { email: input.email, id: userId, name: input.name };
  });
}
