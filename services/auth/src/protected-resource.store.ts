import { Clock, Context, Effect, Layer } from "effect";
import { DASHBOARD_CLIENT_REFERENCES } from "./constants/oauth-identifiers.js";
import {
  constrainedStorageEffect,
  storageEffect,
} from "./dashboard/dashboard.effect.js";
import {
  DashboardError,
  dashboardStorageError,
} from "./dashboard/dashboard.error.js";
import type {
  DashboardApi,
  DashboardApplication,
} from "./dashboard/dashboard.models.js";

interface CountRow {
  readonly count: number;
}

interface ApplicationRow {
  readonly apiId: string;
  readonly apiName: string;
  readonly clientId: string;
  readonly createdAt: number | string;
  readonly disabled: boolean | number;
  readonly name: string;
  readonly redirectUris: string;
  readonly type: string;
  readonly updatedAt: number | string;
}

interface ManagedApplicationRow extends ApplicationRow {
  readonly public: number;
  readonly referenceId: string;
}

export interface ManagedApplication extends DashboardApplication {
  readonly publicClient: boolean;
  readonly referenceId: string;
}

function parseStringList(value: string): ReadonlyArray<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw dashboardStorageError("parse Application redirect URIs");
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((entry) => typeof entry === "string")
  ) {
    throw dashboardStorageError("parse Application redirect URIs");
  }
  return parsed;
}

function parseTimestamp(value: number | string): number {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw dashboardStorageError("parse Application timestamp");
  }
  return timestamp;
}

function applicationView(row: ApplicationRow): DashboardApplication {
  if (row.type !== "native" && row.type !== "web") {
    throw dashboardStorageError("parse Application type");
  }
  return {
    apiId: row.apiId,
    apiName: row.apiName,
    clientId: row.clientId,
    createdAt: parseTimestamp(row.createdAt),
    disabled: Boolean(row.disabled),
    name: row.name,
    redirectUris: parseStringList(row.redirectUris),
    type: row.type,
    updatedAt: parseTimestamp(row.updatedAt),
  };
}

function managedApplicationView(
  row: ManagedApplicationRow,
): ManagedApplication {
  return {
    ...applicationView(row),
    publicClient: Boolean(row.public),
    referenceId: row.referenceId,
  };
}

export interface ApiRecordInput {
  readonly description: string;
  readonly identifier: string;
  readonly name: string;
}

class D1ProtectedResourceStore {
  constructor(private readonly database: D1Database) {}

  readonly listAudiences = storageEffect(
    "list protected API audiences",
    async () => {
      const result = await this.database
        .prepare("SELECT identifier FROM authApi ORDER BY identifier")
        .all<{ identifier: string }>();
      return result.results.map(({ identifier }) => identifier);
    },
  );

  hasAssignment(clientId: string, resource: string) {
    return storageEffect("validate protected API assignment", async () => {
      const assignment = await this.database
        .prepare(
          `SELECT link.clientId
           FROM dashboardApplicationApi link
           JOIN authApi api ON api.id = link.apiId
           JOIN oauthClient client ON client.clientId = link.clientId
           WHERE link.clientId = ? AND api.identifier = ?
             AND client.referenceId IN (?, ?)
             AND COALESCE(client.disabled, 0) = 0`,
        )
        .bind(clientId, resource, ...DASHBOARD_CLIENT_REFERENCES)
        .first<{ clientId: string }>();
      return assignment !== null;
    });
  }

  readonly listApis = storageEffect("list APIs", async () => {
    const result = await this.database
      .prepare(
        `SELECT a.id, a.name, a.identifier, a.description, a.createdAt, a.updatedAt,
           COUNT(link.clientId) AS applicationCount
           FROM authApi a LEFT JOIN dashboardApplicationApi link ON link.apiId = a.id
           GROUP BY a.id ORDER BY a.createdAt DESC`,
      )
      .all<DashboardApi>();
    return result.results;
  });

  createApi(input: ApiRecordInput) {
    const { database } = this;
    return Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      return yield* constrainedStorageEffect(
        "create API",
        "An API with this identifier already exists.",
        async () => {
          const id = crypto.randomUUID();
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
    });
  }

  updateApi(apiId: string, input: ApiRecordInput) {
    const { database } = this;
    return Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      yield* constrainedStorageEffect(
        "update API",
        "An API with this identifier already exists.",
        async () => {
          const result = await database
            .prepare(
              "UPDATE authApi SET name = ?, identifier = ?, description = ?, updatedAt = ? WHERE id = ?",
            )
            .bind(input.name, input.identifier, input.description, now, apiId)
            .run();
          if (!result.meta.changes) {
            throw new DashboardError({
              message: "API not found.",
              status: 404,
            });
          }
        },
      );
    });
  }

  removeApi(apiId: string) {
    return constrainedStorageEffect(
      "remove API",
      "Move or delete this API's applications first.",
      async () => {
        const linked = await this.database
          .prepare(
            "SELECT COUNT(*) AS count FROM dashboardApplicationApi WHERE apiId = ?",
          )
          .bind(apiId)
          .first<CountRow>();
        if ((linked?.count ?? 0) > 0) {
          throw new DashboardError({
            message: "Move or delete this API's applications first.",
            status: 409,
          });
        }
        const result = await this.database
          .prepare("DELETE FROM authApi WHERE id = ?")
          .bind(apiId)
          .run();
        if (!result.meta.changes) {
          throw new DashboardError({ message: "API not found.", status: 404 });
        }
      },
    );
  }

  readonly listApplications = storageEffect("list Applications", async () => {
    const result = await this.database
      .prepare(
        `SELECT c.clientId, c.name, c.redirectUris, c.type, c.disabled,
           c.createdAt, c.updatedAt, link.apiId, api.name AS apiName
           FROM oauthClient c
           JOIN dashboardApplicationApi link ON link.clientId = c.clientId
           JOIN authApi api ON api.id = link.apiId
           WHERE c.referenceId IN (?, ?)
           ORDER BY c.createdAt DESC`,
      )
      .bind(...DASHBOARD_CLIENT_REFERENCES)
      .all<ApplicationRow>();
    return result.results.map(applicationView);
  });

  requireApi(apiId: string) {
    return storageEffect("read API assignment", async () => {
      const api = await this.database
        .prepare("SELECT id, name FROM authApi WHERE id = ?")
        .bind(apiId)
        .first<{ id: string; name: string }>();
      if (!api) {
        throw new DashboardError({
          message: "The selected API was not found.",
          status: 404,
        });
      }
      return api;
    });
  }

  requireApplication(clientId: string) {
    return storageEffect("read Application ownership", async () => {
      const row = await this.database
        .prepare(
          `SELECT c.clientId, c.name, c.redirectUris, c.type, c.disabled,
           c.public, c.referenceId, c.createdAt, c.updatedAt,
           link.apiId, api.name AS apiName
           FROM oauthClient c
           JOIN dashboardApplicationApi link ON link.clientId = c.clientId
           JOIN authApi api ON api.id = link.apiId
           WHERE c.clientId = ? AND c.referenceId IN (?, ?)`,
        )
        .bind(clientId, ...DASHBOARD_CLIENT_REFERENCES)
        .first<ManagedApplicationRow>();
      if (!row) {
        throw new DashboardError({
          message: "Application not found.",
          status: 404,
        });
      }
      return managedApplicationView(row);
    });
  }

  assignApplication(clientId: string, apiId: string) {
    const { database } = this;
    return Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      yield* constrainedStorageEffect(
        "assign Application to API",
        "The selected API no longer exists.",
        () =>
          database
            .prepare(
              "INSERT INTO dashboardApplicationApi (clientId, apiId, createdAt) VALUES (?, ?, ?)",
            )
            .bind(clientId, apiId, now)
            .run(),
      );
    });
  }

  updateApplicationRecord(
    clientId: string,
    referenceId: string,
    apiId: string,
    disabled: boolean,
  ) {
    const { database } = this;
    return Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      yield* constrainedStorageEffect(
        "update Application assignment",
        "The selected API no longer exists.",
        async () => {
          const [clientUpdate, assignmentUpdate] = await database.batch([
            database
              .prepare(
                `UPDATE oauthClient SET disabled = ?, updatedAt = ?
                   WHERE clientId = ? AND referenceId = ?
                     AND EXISTS (
                       SELECT 1 FROM dashboardApplicationApi link
                       WHERE link.clientId = oauthClient.clientId
                     )`,
              )
              .bind(disabled ? 1 : 0, now, clientId, referenceId),
            database
              .prepare(
                `UPDATE dashboardApplicationApi SET apiId = ?
                   WHERE clientId = ?
                     AND EXISTS (
                       SELECT 1 FROM oauthClient client
                       WHERE client.clientId = dashboardApplicationApi.clientId
                         AND client.referenceId = ?
                     )`,
              )
              .bind(apiId, clientId, referenceId),
          ]);
          if (
            clientUpdate?.meta.changes !== 1 ||
            assignmentUpdate?.meta.changes !== 1
          ) {
            throw new DashboardError({
              message: "Application not found.",
              status: 404,
            });
          }
        },
      );
    });
  }
}

export type ProtectedResourceStoreService = Pick<
  D1ProtectedResourceStore,
  keyof D1ProtectedResourceStore
>;

export class ProtectedResourceStore extends Context.Service<
  ProtectedResourceStore,
  ProtectedResourceStoreService
>()("@chikara/auth/ProtectedResourceStore") {}

export function protectedResourceStoreLayer(database: D1Database) {
  return Layer.succeed(
    ProtectedResourceStore,
    new D1ProtectedResourceStore(database),
  );
}
