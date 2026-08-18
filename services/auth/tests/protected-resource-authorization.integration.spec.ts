import { Effect, Layer } from "effect";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthBindings } from "../src/configs/auth.config.js";
import { protectedResourceStoreLayer } from "../src/protected-resource.store.js";
import {
  ApplicationProvider,
  ApplicationProviderError,
  type ApplicationProviderOperation,
  type ApplicationProviderService,
  authorizeTokenRequest,
  protectedResourceAuthorization,
} from "../src/protected-resource-authorization.js";
import { applyAuthMigrations } from "./auth-database.js";

function tokenRequest(resource: string): Request {
  return new Request("http://localhost/api/auth/oauth2/token", {
    body: new URLSearchParams({
      client_id: "client-1",
      grant_type: "client_credentials",
      resource,
    }),
    method: "POST",
  });
}

function authorizationLayer(
  database: D1Database,
  provider: ApplicationProviderService,
) {
  return Layer.merge(
    protectedResourceStoreLayer(database),
    Layer.succeed(ApplicationProvider, provider),
  );
}

function runTokenAuthorization(request: Request, database: D1Database) {
  return Effect.runPromise(
    authorizeTokenRequest(request).pipe(
      Effect.provide(protectedResourceStoreLayer(database)),
    ),
  );
}

function testProviderEffect<A>(
  operation: ApplicationProviderOperation,
  task: () => Promise<A>,
) {
  return Effect.tryPromise({
    catch: (cause) =>
      new ApplicationProviderError({ operation, providerCause: cause }),
    try: task,
  });
}

function missingCredential() {
  return Effect.as(Effect.void, undefined);
}

describe("protected resource authorization", () => {
  let miniflare: Miniflare;
  let bindings: AuthBindings;

  beforeEach(async () => {
    miniflare = new Miniflare(
      convertV4MiniflareOptions({
        compatibilityDate: "2026-08-08",
        d1Databases: ["AUTH_DB"],
        modules: true,
        script: "export default { fetch() { return new Response('ok') } }",
      }),
    );
    bindings = await miniflare.getBindings<AuthBindings>();
    await applyAuthMigrations(bindings.AUTH_DB);
    const now = Date.now();
    await bindings.AUTH_DB.batch([
      bindings.AUTH_DB.prepare(
        "INSERT INTO authApi (id, name, identifier, description, createdAt, updatedAt) VALUES (?, ?, ?, '', ?, ?)",
      ).bind("api-1", "Core API", "https://api.example.com/", now, now),
      bindings.AUTH_DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, name, redirectUris, referenceId, type, public, disabled, createdAt, updatedAt)
         VALUES (?, ?, 'Web client', '[]', 'chikara:auth-dashboard', 'web', 0, 0, ?, ?)`,
      ).bind("client-row", "client-1", now, now),
      bindings.AUTH_DB.prepare(
        "INSERT INTO dashboardApplicationApi (clientId, apiId, createdAt) VALUES (?, ?, ?)",
      ).bind("client-1", "api-1", now),
    ]);
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("allows only an active managed Application assigned to the audience", async () => {
    expect(
      await runTokenAuthorization(
        tokenRequest("https://api.example.com/"),
        bindings.AUTH_DB,
      ),
    ).toBeUndefined();
    expect(
      (
        await runTokenAuthorization(
          tokenRequest("https://other.example.com/"),
          bindings.AUTH_DB,
        )
      )?.status,
    ).toBe(400);

    await bindings.AUTH_DB.prepare(
      "UPDATE oauthClient SET disabled = 1 WHERE clientId = ?",
    )
      .bind("client-1")
      .run();
    expect(
      (
        await runTokenAuthorization(
          tokenRequest("https://api.example.com/"),
          bindings.AUTH_DB,
        )
      )?.status,
    ).toBe(400);

    await bindings.AUTH_DB.prepare(
      "UPDATE oauthClient SET disabled = 0, referenceId = 'external' WHERE clientId = ?",
    )
      .bind("client-1")
      .run();
    expect(
      (
        await runTokenAuthorization(
          tokenRequest("https://api.example.com/"),
          bindings.AUTH_DB,
        )
      )?.status,
    ).toBe(400);
  });

  it("removes a web Application when its one-time value is missing", async () => {
    let removedClientId = "";
    const applicationProvider: ApplicationProviderService = {
      create: () =>
        Effect.succeed({
          clientId: "incomplete-client",
          referenceId: "otakuma:auth-dashboard",
        }),
      remove: (_headers, _referenceId, clientId) =>
        Effect.sync(() => {
          removedClientId = clientId;
        }),
      rotate: missingCredential,
      update: () => Effect.void,
    };
    const testLayer = authorizationLayer(bindings.AUTH_DB, applicationProvider);

    await expect(
      Effect.runPromise(
        protectedResourceAuthorization
          .createApplication(new Headers(), {
            apiId: "api-1",
            name: "Incomplete web Application",
            redirectUris: ["https://app.example.com/callback"],
            type: "web",
          })
          .pipe(Effect.provide(testLayer)),
      ),
    ).rejects.toThrow("The provider did not issue a credential.");
    expect(removedClientId).toBe("incomplete-client");
  });

  it("removes a created Application when its API assignment fails", async () => {
    const now = Date.now();
    await bindings.AUTH_DB.prepare(
      "INSERT INTO authApi (id, name, identifier, description, createdAt, updatedAt) VALUES (?, ?, ?, '', ?, ?)",
    )
      .bind("api-2", "Reports API", "https://reports.example.com/", now, now)
      .run();
    let removedClientId = "";
    const applicationProvider: ApplicationProviderService = {
      create: () =>
        testProviderEffect("create", async () => {
          await bindings.AUTH_DB.prepare("DELETE FROM authApi WHERE id = ?")
            .bind("api-2")
            .run();
          return {
            clientId: "orphaned-client",
            referenceId: "otakuma:auth-dashboard",
            secret: "one-time-value",
          };
        }),
      remove: (_headers, _referenceId, clientId) =>
        Effect.sync(() => {
          removedClientId = clientId;
        }),
      rotate: missingCredential,
      update: () => Effect.void,
    };

    await expect(
      Effect.runPromise(
        protectedResourceAuthorization
          .createApplication(new Headers(), {
            apiId: "api-2",
            name: "Orphaned Application",
            redirectUris: ["https://app.example.com/callback"],
            type: "web",
          })
          .pipe(
            Effect.provide(
              authorizationLayer(bindings.AUTH_DB, applicationProvider),
            ),
          ),
      ),
    ).rejects.toThrow("The selected API no longer exists.");
    expect(removedClientId).toBe("orphaned-client");
  });

  it("restores Provider configuration when an assignment update fails", async () => {
    const now = Date.now();
    await bindings.AUTH_DB.prepare(
      "INSERT INTO authApi (id, name, identifier, description, createdAt, updatedAt) VALUES (?, ?, ?, '', ?, ?)",
    )
      .bind("api-2", "Reports API", "https://reports.example.com/", now, now)
      .run();
    const updates: Array<{
      readonly name: string;
      readonly redirectUris: ReadonlyArray<string>;
    }> = [];
    const applicationProvider: ApplicationProviderService = {
      create: () =>
        Effect.succeed({
          clientId: "unused",
          referenceId: "otakuma:auth-dashboard",
        }),
      remove: () => Effect.void,
      rotate: missingCredential,
      update: (_headers, _referenceId, _clientId, input) =>
        testProviderEffect("update", async () => {
          updates.push(input);
          if (updates.length === 1) {
            await bindings.AUTH_DB.prepare(
              "DELETE FROM dashboardApplicationApi WHERE clientId = ?",
            )
              .bind("client-1")
              .run();
          }
        }),
    };

    await expect(
      Effect.runPromise(
        protectedResourceAuthorization
          .updateApplication(new Headers(), "client-1", {
            apiId: "api-2",
            disabled: false,
            name: "Updated client",
            redirectUris: ["https://updated.example.com/callback"],
          })
          .pipe(
            Effect.provide(
              authorizationLayer(bindings.AUTH_DB, applicationProvider),
            ),
          ),
      ),
    ).rejects.toThrow("Application not found.");
    expect(updates).toEqual([
      {
        name: "Updated client",
        redirectUris: ["https://updated.example.com/callback"],
      },
      { name: "Web client", redirectUris: [] },
    ]);
  });

  it("rejects a corrupt stored callback URI list", async () => {
    await bindings.AUTH_DB.prepare(
      "UPDATE oauthClient SET redirectUris = 'not-json' WHERE clientId = ?",
    )
      .bind("client-1")
      .run();

    await expect(
      Effect.runPromise(
        protectedResourceAuthorization.listApplications.pipe(
          Effect.provide(protectedResourceStoreLayer(bindings.AUTH_DB)),
        ),
      ),
    ).rejects.toThrow(
      "Dashboard storage failed during parse Application redirect URIs.",
    );
  });
});
