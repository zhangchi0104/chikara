import { constrainedStorageEffect, storageEffect } from "./dashboard.effect.js";
import { DashboardError } from "./dashboard.error.js";
import type { DashboardApi } from "./dashboard.models.js";

interface CountRow {
  readonly count: number;
}

export function listApis(database: D1Database) {
  return storageEffect("list APIs", async () => {
    const result = await database
      .prepare(
        `SELECT a.id, a.name, a.identifier, a.description, a.createdAt, a.updatedAt,
         COUNT(link.clientId) AS applicationCount
         FROM authApi a LEFT JOIN dashboardApplicationApi link ON link.apiId = a.id
         GROUP BY a.id ORDER BY a.createdAt DESC`,
      )
      .all<DashboardApi>();
    return result.results;
  });
}

export interface ApiInput {
  readonly description: string;
  readonly identifier: string;
  readonly name: string;
}

export function createApi(database: D1Database, input: ApiInput) {
  const id = crypto.randomUUID();
  const now = Date.now();
  return constrainedStorageEffect(
    "create API",
    "An API with this identifier already exists.",
    async () => {
      await database
        .prepare(
          "INSERT INTO authApi (id, name, identifier, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id, input.name, input.identifier, input.description, now, now)
        .run();
      return {
        ...input,
        applicationCount: 0,
        createdAt: now,
        id,
        updatedAt: now,
      } satisfies DashboardApi;
    },
  );
}

export function updateApi(
  database: D1Database,
  apiId: string,
  input: ApiInput,
) {
  return constrainedStorageEffect(
    "update API",
    "An API with this identifier already exists.",
    async () => {
      const result = await database
        .prepare(
          "UPDATE authApi SET name = ?, identifier = ?, description = ?, updatedAt = ? WHERE id = ?",
        )
        .bind(
          input.name,
          input.identifier,
          input.description,
          Date.now(),
          apiId,
        )
        .run();
      if (!result.meta.changes) throw new DashboardError(404, "API not found.");
    },
  );
}

export function removeApi(database: D1Database, apiId: string) {
  return storageEffect("remove API", async () => {
    const linked = await database
      .prepare(
        "SELECT COUNT(*) AS count FROM dashboardApplicationApi WHERE apiId = ?",
      )
      .bind(apiId)
      .first<CountRow>();
    if ((linked?.count ?? 0) > 0) {
      throw new DashboardError(
        409,
        "Move or delete this API's applications first.",
      );
    }
    const result = await database
      .prepare("DELETE FROM authApi WHERE id = ?")
      .bind(apiId)
      .run();
    if (!result.meta.changes) throw new DashboardError(404, "API not found.");
  });
}
