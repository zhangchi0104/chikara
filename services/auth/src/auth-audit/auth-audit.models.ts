export const authEventTypes = [
  "account.signed_up",
  "account.provisioned",
  "login.succeeded",
  "password.changed",
  "two_factor.setup_started",
  "two_factor.enabled",
  "two_factor.disabled",
  "two_factor.setup_reset",
  "two_factor.recovery_codes_regenerated",
  "two_factor.auto_repaired",
] as const;

export type AuthEventType = (typeof authEventTypes)[number];

export interface AuthEventInput {
  readonly actorUserId?: string;
  readonly eventType: AuthEventType;
  readonly subjectUserId: string;
}

export interface AuthEvent {
  readonly actorName: string | null;
  readonly actorUserId: string | null;
  readonly eventType: AuthEventType;
  readonly id: string;
  readonly occurredAt: number;
}

export interface AuthEventCursor {
  readonly id: string;
  readonly occurredAt: number;
}

export interface AuthEventPage {
  readonly events: ReadonlyArray<AuthEvent>;
  readonly nextCursor: AuthEventCursor | null;
}
