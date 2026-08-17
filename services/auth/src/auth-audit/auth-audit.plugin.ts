import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import type { AuthEventInput, AuthEventType } from "./auth-audit.models.js";
import { recordAuthEvent } from "./auth-audit.store.js";

const observedPaths = new Set([
  "/admin/create-user",
  "/change-password",
  "/passkey/verify-authentication",
  "/sign-in/email",
  "/sign-up/email",
  "/two-factor/verify-backup-code",
  "/two-factor/verify-totp",
]);

function returnedUserId(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || !("user" in value)) {
    return undefined;
  }
  const user = value.user;
  if (user === null || typeof user !== "object" || !("id" in user)) {
    return undefined;
  }
  return typeof user.id === "string" ? user.id : undefined;
}

interface AuditHookState {
  readonly hasSession: boolean;
  readonly newSessionUserId: string | undefined;
  readonly path: string;
  readonly returnedUserId: string | undefined;
  readonly sessionUserId: string | undefined;
}

function selfEvent(
  eventType: AuthEventType,
  subjectUserId: string | undefined,
): AuthEventInput | undefined {
  return subjectUserId
    ? { actorUserId: subjectUserId, eventType, subjectUserId }
    : undefined;
}

function eventFromHook(state: AuditHookState): AuthEventInput | undefined {
  switch (state.path) {
    case "/sign-up/email":
      return selfEvent("account.signed_up", state.returnedUserId);
    case "/admin/create-user":
      return state.returnedUserId
        ? {
            ...(state.sessionUserId
              ? { actorUserId: state.sessionUserId }
              : {}),
            eventType: "account.provisioned",
            subjectUserId: state.returnedUserId,
          }
        : undefined;
    case "/change-password":
      return state.hasSession
        ? selfEvent("password.changed", state.returnedUserId)
        : undefined;
    case "/sign-in/email":
    case "/passkey/verify-authentication":
      return selfEvent("login.succeeded", state.newSessionUserId);
    case "/two-factor/verify-backup-code":
    case "/two-factor/verify-totp":
      return state.hasSession
        ? undefined
        : selfEvent("login.succeeded", state.newSessionUserId);
    default:
      return undefined;
  }
}

export function createAuthAuditPlugin(database: D1Database): BetterAuthPlugin {
  return {
    hooks: {
      after: [
        {
          handler: createAuthMiddleware(async (context) => {
            const { newSession, returned, session } = context.context;
            const event = eventFromHook({
              hasSession: Boolean(session),
              newSessionUserId: newSession?.user.id,
              path: context.path,
              returnedUserId: returnedUserId(returned),
              sessionUserId: session?.user.id,
            });
            if (event) await recordAuthEvent(database, event);
          }),
          matcher: ({ path }) => path !== undefined && observedPaths.has(path),
        },
      ],
    },
    id: "auth-audit",
  };
}
