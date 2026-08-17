import type {
  AuthEvent,
  AuthEventCursor,
  AuthEventInput,
  AuthEventPage,
} from "./auth-audit.models.js";

const activityPageSize = 25;

export function prepareAuthEventInsert(
  database: D1Database,
  event: AuthEventInput,
  occurredAt = Date.now(),
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO authAuditEvent
       (id, subjectUserId, actorUserId, eventType, occurredAt)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      event.subjectUserId,
      event.actorUserId ?? null,
      event.eventType,
      occurredAt,
    );
}

export async function recordAuthEvent(
  database: D1Database,
  event: AuthEventInput,
): Promise<void> {
  try {
    await prepareAuthEventInsert(database, event).run();
  } catch (error) {
    console.error(
      "Auth activity could not be recorded",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

export async function listAuthEvents(
  database: D1Database,
  subjectUserId: string,
  cursor?: AuthEventCursor,
): Promise<AuthEventPage> {
  const cursorClause = cursor
    ? 'AND (event."occurredAt" < ? OR (event."occurredAt" = ? AND event."id" < ?))'
    : "";
  const statement = database.prepare(
    `SELECT event.id, event.eventType, event.occurredAt,
     event.actorUserId, actor.name AS actorName
     FROM authAuditEvent event
     LEFT JOIN "user" actor ON actor.id = event.actorUserId
     WHERE event.subjectUserId = ? ${cursorClause}
     ORDER BY event.occurredAt DESC, event.id DESC
     LIMIT ?`,
  );
  const bound = cursor
    ? statement.bind(
        subjectUserId,
        cursor.occurredAt,
        cursor.occurredAt,
        cursor.id,
        activityPageSize + 1,
      )
    : statement.bind(subjectUserId, activityPageSize + 1);
  const result = await bound.all<AuthEvent>();
  const events = result.results.slice(0, activityPageSize);
  const last = events.at(-1);
  return {
    events,
    nextCursor:
      result.results.length > activityPageSize && last
        ? { id: last.id, occurredAt: last.occurredAt }
        : null,
  };
}
