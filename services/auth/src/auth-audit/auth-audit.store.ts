import { Clock, Effect } from "effect";
import { runtimePromise } from "../auth-runtime.effect.js";
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
  occurredAt: number,
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

export function recordAuthEvent(database: D1Database, event: AuthEventInput) {
  return Effect.gen(function* () {
    const occurredAt = yield* Clock.currentTimeMillis;
    yield* runtimePromise("record auth activity", () =>
      prepareAuthEventInsert(database, event, occurredAt).run(),
    );
  }).pipe(
    Effect.catch((error) =>
      Effect.logError("Auth activity could not be recorded").pipe(
        Effect.annotateLogs({ error }),
      ),
    ),
  );
}

export function listAuthEvents(
  database: D1Database,
  subjectUserId: string,
  cursor?: AuthEventCursor,
) {
  return runtimePromise("list auth activity", async () => {
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
    } satisfies AuthEventPage;
  });
}
