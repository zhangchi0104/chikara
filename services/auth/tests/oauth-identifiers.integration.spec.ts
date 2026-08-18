import { Effect } from "effect";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AuthBindings } from "../src/configs/auth.config.js";
import {
  BOOTSTRAP_KEY,
  bootstrapSuperuser,
} from "../src/dashboard/dashboard.auth.js";
import { digest } from "../src/dashboard/dashboard.crypto.js";
import { applyAuthMigrations } from "./auth-database.js";
import { createTestAuth } from "./auth-runtime.js";

const LEGACY_CLIENT_ID = "chikara_legacy_client";
const LEGACY_CLIENT_REFERENCE = "chikara:auth-dashboard";
const LEGACY_CLIENT_SECRET = `chikara_cs_${"s".repeat(32)}`;
const LEGACY_ACCESS_TOKEN = `chikara_at_${"a".repeat(32)}`;
const LEGACY_REFRESH_TOKEN = `chikara_rt_${"r".repeat(32)}`;
const USER_ID = "legacy-user";

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("The sign-in response did not set a cookie.");
  return header.split(";", 1)[0] ?? "";
}

function withoutPrefix(value: string, prefix: string): string {
  if (!value.startsWith(prefix)) throw new Error("Fixture prefix mismatch.");
  return value.slice(prefix.length);
}

function hashLegacyValue(value: string, prefix: string) {
  return Effect.runPromise(digest(withoutPrefix(value, prefix)));
}

async function seedLegacyOAuthState(database: D1Database): Promise<void> {
  const now = Date.now();
  await database.batch([
    database
      .prepare(
        `INSERT INTO "user"
         (id, name, email, emailVerified, image, createdAt, updatedAt,
          role, banned, twoFactorEnabled)
         VALUES (?, ?, ?, 1, NULL, ?, ?, 'user', 0, 0)`,
      )
      .bind(USER_ID, "Legacy User", "legacy@example.com", now, now),
    database
      .prepare(
        `INSERT INTO oauthClient
         (id, clientId, clientSecret, redirectUris, tokenEndpointAuthMethod,
          grantTypes, responseTypes, scopes, public, type, referenceId,
          disabled, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'web', ?, 0, ?, ?)`,
      )
      .bind(
        "legacy-client-row",
        LEGACY_CLIENT_ID,
        await hashLegacyValue(LEGACY_CLIENT_SECRET, "chikara_cs_"),
        JSON.stringify(["https://legacy.example/callback"]),
        "client_secret_basic",
        JSON.stringify([
          "authorization_code",
          "client_credentials",
          "refresh_token",
        ]),
        JSON.stringify(["code"]),
        JSON.stringify(["offline_access", "profile", "read:data"]),
        LEGACY_CLIENT_REFERENCE,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO oauthAccessToken
         (id, token, clientId, userId, expiresAt, createdAt, scopes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        "legacy-access-row",
        await hashLegacyValue(LEGACY_ACCESS_TOKEN, "chikara_at_"),
        LEGACY_CLIENT_ID,
        USER_ID,
        now + 3_600_000,
        now,
        JSON.stringify(["profile"]),
      ),
    database
      .prepare(
        `INSERT INTO oauthRefreshToken
         (id, token, clientId, userId, expiresAt, createdAt, revoked, scopes)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .bind(
        "legacy-refresh-row",
        await hashLegacyValue(LEGACY_REFRESH_TOKEN, "chikara_rt_"),
        LEGACY_CLIENT_ID,
        USER_ID,
        now + 86_400_000,
        now,
        JSON.stringify(["offline_access", "profile"]),
      ),
  ]);
}

function oauthRequest(path: string, body: URLSearchParams): Request {
  return new Request(`http://localhost:8787/api/auth/oauth2/${path}`, {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
}

async function bootstrapAndSignIn(bindings: AuthBindings): Promise<string> {
  const token = "otakuma_bootstrap_legacy_reference_test";
  await bindings.AUTH_BOOTSTRAP.put(
    BOOTSTRAP_KEY,
    JSON.stringify({ digest: await Effect.runPromise(digest(token)) }),
  );
  await Effect.runPromise(
    bootstrapSuperuser(bindings, {
      email: "admin@example.com",
      name: "Admin",
      password: "correct horse battery staple",
      token,
    }),
  );
  const auth = await Effect.runPromise(createTestAuth(bindings));
  const response = await auth.handler(
    new Request("http://localhost:8787/api/auth/sign-in/email", {
      body: JSON.stringify({
        email: "admin@example.com",
        password: "correct horse battery staple",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:4321",
      },
      method: "POST",
    }),
  );
  expect(response.status).toBe(200);
  return sessionCookie(response);
}

describe("OAuth identifier compatibility", () => {
  let bindings: AuthBindings;
  let miniflare: Miniflare;

  beforeEach(async () => {
    miniflare = new Miniflare(
      convertV4MiniflareOptions({
        bindings: {
          AUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION: "false",
          AUTH_TRUSTED_ORIGINS: "http://localhost:4321",
          BETTER_AUTH_SECRET: "integration-test-secret-at-least-32-characters",
          BETTER_AUTH_URL: "http://localhost:8787",
        },
        compatibilityDate: "2026-08-08",
        d1Databases: ["AUTH_DB"],
        kvNamespaces: ["AUTH_BOOTSTRAP"],
        modules: true,
        script: "export default { fetch() { return new Response('ok') } }",
      }),
    );
    bindings = await miniflare.getBindings<AuthBindings>();
    await applyAuthMigrations(bindings.AUTH_DB);
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("accepts legacy client and access token values while issuing Otakuma tokens", async () => {
    await seedLegacyOAuthState(bindings.AUTH_DB);
    const auth = await Effect.runPromise(createTestAuth(bindings));
    const issued = await auth.handler(
      oauthRequest(
        "token",
        new URLSearchParams({
          client_id: LEGACY_CLIENT_ID,
          client_secret: LEGACY_CLIENT_SECRET,
          grant_type: "client_credentials",
          scope: "read:data",
        }),
      ),
    );
    expect(issued.status).toBe(200);
    const issuedBody: unknown = await issued.json();
    expect(issuedBody).toMatchObject({
      access_token: expect.stringMatching(/^otakuma_at_/),
    });
    if (
      !issuedBody ||
      typeof issuedBody !== "object" ||
      !("access_token" in issuedBody) ||
      typeof issuedBody.access_token !== "string"
    ) {
      throw new Error("The OAuth token response was missing an access token.");
    }

    const issuedIntrospection = await auth.handler(
      oauthRequest(
        "introspect",
        new URLSearchParams({
          client_id: LEGACY_CLIENT_ID,
          client_secret: LEGACY_CLIENT_SECRET,
          token: issuedBody.access_token,
          token_type_hint: "access_token",
        }),
      ),
    );
    expect(issuedIntrospection.status).toBe(200);
    expect(await issuedIntrospection.json()).toMatchObject({
      active: true,
      client_id: LEGACY_CLIENT_ID,
    });

    const introspected = await auth.handler(
      oauthRequest(
        "introspect",
        new URLSearchParams({
          client_id: LEGACY_CLIENT_ID,
          client_secret: LEGACY_CLIENT_SECRET,
          token: LEGACY_ACCESS_TOKEN,
          token_type_hint: "access_token",
        }),
      ),
    );
    expect(introspected.status).toBe(200);
    expect(await introspected.json()).toMatchObject({
      active: true,
      client_id: LEGACY_CLIENT_ID,
      sub: USER_ID,
    });
  });

  it("rotates a legacy refresh token into Otakuma access and refresh tokens", async () => {
    await seedLegacyOAuthState(bindings.AUTH_DB);
    const auth = await Effect.runPromise(createTestAuth(bindings));
    const refreshed = await auth.handler(
      oauthRequest(
        "token",
        new URLSearchParams({
          client_id: LEGACY_CLIENT_ID,
          client_secret: LEGACY_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: LEGACY_REFRESH_TOKEN,
        }),
      ),
    );
    expect(refreshed.status).toBe(200);
    const refreshedBody: unknown = await refreshed.json();
    expect(refreshedBody).toMatchObject({
      access_token: expect.stringMatching(/^otakuma_at_/),
      refresh_token: expect.stringMatching(/^otakuma_rt_/),
    });
    if (
      !refreshedBody ||
      typeof refreshedBody !== "object" ||
      !("refresh_token" in refreshedBody) ||
      typeof refreshedBody.refresh_token !== "string"
    ) {
      throw new Error("The OAuth token response was missing a refresh token.");
    }

    const refreshedAgain = await auth.handler(
      oauthRequest(
        "token",
        new URLSearchParams({
          client_id: LEGACY_CLIENT_ID,
          client_secret: LEGACY_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: refreshedBody.refresh_token,
        }),
      ),
    );
    expect(refreshedAgain.status).toBe(200);
    expect(await refreshedAgain.json()).toMatchObject({
      access_token: expect.stringMatching(/^otakuma_at_/),
      refresh_token: expect.stringMatching(/^otakuma_rt_/),
    });
  });

  it("keeps a legacy-reference Application manageable", async () => {
    const cookie = await bootstrapAndSignIn(bindings);
    const now = Date.now();
    await bindings.AUTH_DB.batch([
      bindings.AUTH_DB.prepare(
        "INSERT INTO authApi (id, name, identifier, description, createdAt, updatedAt) VALUES (?, ?, ?, '', ?, ?)",
      ).bind("api-1", "Core API", "https://api.example.com/", now, now),
      bindings.AUTH_DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, clientSecret, name, redirectUris, referenceId,
          tokenEndpointAuthMethod, grantTypes, responseTypes, scopes,
          type, public, disabled, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web', 0, 0, ?, ?)`,
      ).bind(
        "legacy-managed-row",
        LEGACY_CLIENT_ID,
        await hashLegacyValue(LEGACY_CLIENT_SECRET, "chikara_cs_"),
        "Legacy Application",
        JSON.stringify(["https://legacy.example/callback"]),
        LEGACY_CLIENT_REFERENCE,
        "client_secret_basic",
        JSON.stringify(["authorization_code", "refresh_token"]),
        JSON.stringify(["code"]),
        JSON.stringify(["openid", "profile", "email", "offline_access"]),
        now,
        now,
      ),
      bindings.AUTH_DB.prepare(
        "INSERT INTO dashboardApplicationApi (clientId, apiId, createdAt) VALUES (?, ?, ?)",
      ).bind(LEGACY_CLIENT_ID, "api-1", now),
    ]);
    const app = createApp();
    const headers = { cookie, "content-type": "application/json" };

    const listed = await app.request(
      "/api/dashboard/applications",
      { headers },
      bindings,
    );
    expect(await listed.json()).toMatchObject({
      applications: [expect.objectContaining({ clientId: LEGACY_CLIENT_ID })],
    });

    const updated = await app.request(
      `/api/dashboard/applications/${LEGACY_CLIENT_ID}`,
      {
        body: JSON.stringify({
          apiId: "api-1",
          disabled: false,
          name: "Updated Legacy Application",
          redirectUris: ["https://legacy.example/updated"],
        }),
        headers,
        method: "PATCH",
      },
      bindings,
    );
    expect(updated.status).toBe(200);

    const rotated = await app.request(
      `/api/dashboard/applications/${LEGACY_CLIENT_ID}/rotate`,
      { headers, method: "POST" },
      bindings,
    );
    expect(rotated.status).toBe(200);
    const rotatedBody: unknown = await rotated.json();
    expect(rotatedBody).toMatchObject({
      credential: expect.stringMatching(/^otakuma_cs_/),
    });
    if (
      !rotatedBody ||
      typeof rotatedBody !== "object" ||
      !("credential" in rotatedBody) ||
      typeof rotatedBody.credential !== "string"
    ) {
      throw new Error("The rotation response was missing a credential.");
    }

    await bindings.AUTH_DB.prepare(
      "UPDATE oauthClient SET grantTypes = ?, scopes = ? WHERE clientId = ?",
    )
      .bind(
        JSON.stringify(["client_credentials"]),
        JSON.stringify(["read:data"]),
        LEGACY_CLIENT_ID,
      )
      .run();
    const auth = await Effect.runPromise(
      createTestAuth(bindings, {
        clientReference: LEGACY_CLIENT_REFERENCE,
      }),
    );
    const issued = await auth.handler(
      oauthRequest(
        "token",
        new URLSearchParams({
          client_id: LEGACY_CLIENT_ID,
          client_secret: rotatedBody.credential,
          grant_type: "client_credentials",
          scope: "read:data",
        }),
      ),
    );
    expect(issued.status).toBe(200);
    expect(await issued.json()).toMatchObject({
      access_token: expect.stringMatching(/^otakuma_at_/),
    });

    const removed = await app.request(
      `/api/dashboard/applications/${LEGACY_CLIENT_ID}`,
      { headers, method: "DELETE" },
      bindings,
    );
    expect(removed.status).toBe(200);
  });
});
