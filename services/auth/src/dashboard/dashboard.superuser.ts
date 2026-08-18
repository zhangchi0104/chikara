import { Effect } from "effect";
import { runtimePromise } from "../auth-runtime.effect.js";

export function isSuperuserId(database: D1Database, userId: string) {
  return runtimePromise("read superuser assignment", () =>
    database
      .prepare(
        "SELECT userId FROM dashboardSuperuser WHERE singleton = 1 AND userId = ?",
      )
      .bind(userId)
      .first<{ userId: string }>(),
  ).pipe(Effect.map((row) => row !== null));
}
