import { Effect } from "effect";
import { createAuth } from "../auth.js";
import type { AuthBindings } from "../configs/auth.config.js";
import { DASHBOARD_CLIENT_REFERENCE } from "../constants/better-auth.constant .js";
import {
  authEffect,
  constrainedStorageEffect,
  storageEffect,
} from "./dashboard.effect.js";
import { DashboardError, DashboardStorageError } from "./dashboard.error.js";
import type {
  ApplicationType,
  CreateApplicationResult,
  DashboardApplication,
} from "./dashboard.models.js";

interface ApplicationRow
  extends Omit<
    DashboardApplication,
    "createdAt" | "disabled" | "redirectUris" | "type" | "updatedAt"
  > {
  readonly createdAt: number | string;
  readonly disabled: boolean | number;
  readonly redirectUris: string;
  readonly type: string;
  readonly updatedAt: number | string;
}

interface ManagedApplicationRow extends ApplicationRow {
  readonly public: number;
}

function parseStringList(value: string): ReadonlyArray<string> {
  try {
    const parsed: object = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function parseTimestamp(value: number | string): number {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new DashboardStorageError("parse Application timestamp");
  }
  return timestamp;
}

function toApplication(row: ApplicationRow): DashboardApplication {
  if (row.type !== "native" && row.type !== "web") {
    throw new DashboardStorageError("parse Application type");
  }
  return {
    ...row,
    createdAt: parseTimestamp(row.createdAt),
    disabled: Boolean(row.disabled),
    redirectUris: parseStringList(row.redirectUris),
    type: row.type,
    updatedAt: parseTimestamp(row.updatedAt),
  };
}

export function listApplications(database: D1Database) {
  return storageEffect("list Applications", async () => {
    const result = await database
      .prepare(
        `SELECT c.clientId, c.name, c.redirectUris, c.type, c.disabled,
         c.createdAt, c.updatedAt, link.apiId, api.name AS apiName
         FROM oauthClient c
         JOIN dashboardApplicationApi link ON link.clientId = c.clientId
         JOIN authApi api ON api.id = link.apiId
         WHERE c.referenceId = ?
         ORDER BY c.createdAt DESC`,
      )
      .bind(DASHBOARD_CLIENT_REFERENCE)
      .all<ApplicationRow>();
    return result.results.map(toApplication);
  });
}

function requireApi(database: D1Database, apiId: string) {
  return storageEffect("read API assignment", async () => {
    const api = await database
      .prepare("SELECT id, name FROM authApi WHERE id = ?")
      .bind(apiId)
      .first<{ id: string; name: string }>();
    if (!api) throw new DashboardError(404, "The selected API was not found.");
    return api;
  });
}

function requireApplication(database: D1Database, clientId: string) {
  return storageEffect("read Application ownership", async () => {
    const row = await database
      .prepare(
        `SELECT c.clientId, c.name, c.redirectUris, c.type, c.disabled,
         c.public, c.createdAt, c.updatedAt, link.apiId, api.name AS apiName
         FROM oauthClient c
         JOIN dashboardApplicationApi link ON link.clientId = c.clientId
         JOIN authApi api ON api.id = link.apiId
         WHERE c.clientId = ? AND c.referenceId = ?`,
      )
      .bind(clientId, DASHBOARD_CLIENT_REFERENCE)
      .first<ManagedApplicationRow>();
    if (!row) throw new DashboardError(404, "Application not found.");
    return row;
  });
}

export interface CreateApplicationInput {
  readonly apiId: string;
  readonly name: string;
  readonly redirectUris: ReadonlyArray<string>;
  readonly type: ApplicationType;
}

export function createApplication(
  bindings: AuthBindings,
  headers: Headers,
  input: CreateApplicationInput,
) {
  return Effect.gen(function* () {
    const api = yield* requireApi(bindings.AUTH_DB, input.apiId);
    const client = yield* authEffect(
      "create Application",
      422,
      "The Application configuration is invalid.",
      async () => {
        const auth = await createAuth(bindings);
        return auth.api.createOAuthClient({
          headers,
          body: {
            client_name: input.name,
            grant_types: ["authorization_code", "refresh_token"],
            redirect_uris: [...input.redirectUris],
            response_types: ["code"],
            scope: "openid profile email offline_access",
            token_endpoint_auth_method:
              input.type === "native" ? "none" : "client_secret_basic",
            type: input.type,
          },
        });
      },
    );

    yield* constrainedStorageEffect(
      "assign Application to API",
      "The selected API no longer exists.",
      () =>
        bindings.AUTH_DB.prepare(
          "INSERT INTO dashboardApplicationApi (clientId, apiId, createdAt) VALUES (?, ?, ?)",
        )
          .bind(client.client_id, input.apiId, Date.now())
          .run()
          .then(() => undefined),
    ).pipe(
      Effect.tapError(() =>
        authEffect(
          "compensate Application creation",
          409,
          "The Application could not be linked to its API.",
          async () => {
            const auth = await createAuth(bindings);
            await auth.api.deleteOAuthClient({
              headers,
              body: { client_id: client.client_id },
            });
          },
        ),
      ),
    );

    const application = {
      apiId: input.apiId,
      apiName: api.name,
      clientId: client.client_id,
      createdAt:
        (client.client_id_issued_at ?? Math.floor(Date.now() / 1_000)) * 1_000,
      disabled: false,
      name: input.name,
      redirectUris: input.redirectUris,
      type: input.type,
      updatedAt:
        (client.client_id_issued_at ?? Math.floor(Date.now() / 1_000)) * 1_000,
    } satisfies DashboardApplication;
    if (input.type === "native") {
      return {
        application: { ...application, type: "native" },
      } satisfies CreateApplicationResult;
    }
    if (!client.client_secret) {
      return yield* Effect.fail(
        new DashboardError(409, "The provider did not issue a credential."),
      );
    }
    return {
      application: { ...application, type: "web" },
      credential: client.client_secret,
    } satisfies CreateApplicationResult;
  });
}

export interface UpdateApplicationInput {
  readonly apiId: string;
  readonly disabled: boolean;
  readonly name: string;
  readonly redirectUris: ReadonlyArray<string>;
}

export function updateApplication(
  bindings: AuthBindings,
  headers: Headers,
  clientId: string,
  input: UpdateApplicationInput,
) {
  return Effect.gen(function* () {
    yield* requireApplication(bindings.AUTH_DB, clientId);
    yield* requireApi(bindings.AUTH_DB, input.apiId);
    yield* authEffect(
      "update Application",
      422,
      "The Application configuration is invalid.",
      async () => {
        const auth = await createAuth(bindings);
        await auth.api.updateOAuthClient({
          headers,
          body: {
            client_id: clientId,
            update: {
              client_name: input.name,
              redirect_uris: [...input.redirectUris],
            },
          },
        });
      },
    );
    yield* constrainedStorageEffect(
      "update Application assignment",
      "The selected API no longer exists.",
      () =>
        bindings.AUTH_DB.batch([
          bindings.AUTH_DB.prepare(
            "UPDATE oauthClient SET disabled = ?, updatedAt = ? WHERE clientId = ? AND referenceId = ?",
          ).bind(
            input.disabled ? 1 : 0,
            Date.now(),
            clientId,
            DASHBOARD_CLIENT_REFERENCE,
          ),
          bindings.AUTH_DB.prepare(
            "UPDATE dashboardApplicationApi SET apiId = ? WHERE clientId = ?",
          ).bind(input.apiId, clientId),
        ]).then(() => undefined),
    );
  });
}

export function rotateApplicationCredential(
  bindings: AuthBindings,
  headers: Headers,
  clientId: string,
) {
  return Effect.gen(function* () {
    const application = yield* requireApplication(bindings.AUTH_DB, clientId);
    if (application.public) {
      return yield* Effect.fail(
        new DashboardError(
          409,
          "Native applications do not use a client credential.",
        ),
      );
    }
    if (application.disabled) {
      return yield* Effect.fail(
        new DashboardError(409, "Enable the Application before rotating it."),
      );
    }
    const client = yield* authEffect(
      "rotate Application credential",
      404,
      "Application not found.",
      async () => {
        const auth = await createAuth(bindings);
        return auth.api.rotateClientSecret({
          headers,
          body: { client_id: clientId },
        });
      },
    );
    if (!client.client_secret) {
      return yield* Effect.fail(
        new DashboardError(409, "The provider did not issue a credential."),
      );
    }
    return client.client_secret;
  });
}

export function removeApplication(
  bindings: AuthBindings,
  headers: Headers,
  clientId: string,
) {
  return requireApplication(bindings.AUTH_DB, clientId).pipe(
    Effect.flatMap(() =>
      authEffect(
        "remove Application",
        404,
        "Application not found.",
        async () => {
          const auth = await createAuth(bindings);
          await auth.api.deleteOAuthClient({
            headers,
            body: { client_id: clientId },
          });
        },
      ),
    ),
  );
}
