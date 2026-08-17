import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth.js";
import type { AuthBindings } from "../src/configs/auth.config.js";
import { validateTokenAudience } from "../src/dashboard/dashboard.access.js";
import {
  BOOTSTRAP_KEY,
  bootstrapSuperuser,
} from "../src/dashboard/dashboard.auth.js";
import { digest } from "../src/dashboard/dashboard.crypto.js";
import { DashboardError } from "../src/dashboard/dashboard.error.js";
import { applyAuthMigrations } from "./auth-database.js";

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("The sign-in response did not set a cookie.");
  return header.split(";", 1)[0] ?? "";
}

async function bootstrapAndSignIn(bindings: AuthBindings): Promise<string> {
  const token = "chikara_bootstrap_sign_in_value";
  await bindings.AUTH_BOOTSTRAP.put(
    BOOTSTRAP_KEY,
    JSON.stringify({ digest: await digest(token) }),
  );
  await bootstrapSuperuser(bindings, {
    email: "admin@example.com",
    name: "Admin",
    password: "correct horse battery staple",
    token,
  });
  return signIn(bindings, "admin@example.com", "correct horse battery staple");
}

async function signIn(
  bindings: AuthBindings,
  email: string,
  password: string,
): Promise<string> {
  const auth = await createAuth(bindings);
  const signIn = await auth.handler(
    new Request("http://localhost:8787/api/auth/sign-in/email", {
      body: JSON.stringify({
        email,
        password,
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:4321",
      },
      method: "POST",
    }),
  );
  expect(signIn.status).toBe(200);
  return sessionCookie(signIn);
}

describe("auth dashboard integration", () => {
  let miniflare: Miniflare;
  let bindings: AuthBindings;

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

  it("consumes the bootstrap token exactly once under concurrency", async () => {
    const token = "chikara_bootstrap_integration_value";
    await bindings.AUTH_BOOTSTRAP.put(
      BOOTSTRAP_KEY,
      JSON.stringify({ digest: await digest(token) }),
    );
    const input = {
      email: "admin@example.com",
      name: "Admin",
      password: "correct horse battery staple",
      token,
    };

    const outcomes = await Promise.allSettled([
      bootstrapSuperuser(bindings, input),
      bootstrapSuperuser(bindings, input),
    ]);

    expect(
      outcomes.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = outcomes.find(({ status }) => status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(DashboardError);
    }
    const row = await bindings.AUTH_DB.prepare(
      'SELECT role FROM "user" WHERE email = ?',
    )
      .bind(input.email)
      .first<{ role: string }>();
    expect(row?.role).toBe("admin");
    expect(await bindings.AUTH_BOOTSTRAP.get(BOOTSTRAP_KEY)).toBeNull();
  });

  it("allows only the Application assigned to the requested API audience", async () => {
    const now = Date.now();
    await bindings.AUTH_DB.batch([
      bindings.AUTH_DB.prepare(
        "INSERT INTO authApi (id, name, identifier, description, createdAt, updatedAt) VALUES (?, ?, ?, '', ?, ?)",
      ).bind("api-1", "Core API", "https://api.example.com/", now, now),
      bindings.AUTH_DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, redirectUris, referenceId, type, public, disabled)
         VALUES (?, ?, '[]', 'chikara:auth-dashboard', 'web', 0, 0)`,
      ).bind("client-row", "client-1"),
      bindings.AUTH_DB.prepare(
        "INSERT INTO dashboardApplicationApi (clientId, apiId, createdAt) VALUES (?, ?, ?)",
      ).bind("client-1", "api-1", now),
    ]);
    const assigned = new Request("http://localhost/api/auth/oauth2/token", {
      body: new URLSearchParams({
        client_id: "client-1",
        grant_type: "client_credentials",
        resource: "https://api.example.com/",
      }),
      method: "POST",
    });
    const unassigned = new Request("http://localhost/api/auth/oauth2/token", {
      body: new URLSearchParams({
        client_id: "client-1",
        grant_type: "client_credentials",
        resource: "https://other.example.com/",
      }),
      method: "POST",
    });

    expect(
      await validateTokenAudience(assigned, bindings.AUTH_DB),
    ).toBeUndefined();
    expect(
      (await validateTokenAudience(unassigned, bindings.AUTH_DB))?.status,
    ).toBe(400);
  });

  it("separates signed-in account identity from management access", async () => {
    const adminCookie = await bootstrapAndSignIn(bindings);
    const app = createApp();
    const unauthorized = await app.request(
      "/api/dashboard/users",
      undefined,
      bindings,
    );
    expect(unauthorized.status).toBe(401);
    const signedOut = await app.request(
      "/api/dashboard/session",
      undefined,
      bindings,
    );
    expect(signedOut.status).toBe(401);

    const adminSession = await app.request(
      "/api/dashboard/session",
      { headers: { cookie: adminCookie } },
      bindings,
    );
    expect(adminSession.status).toBe(200);
    expect(await adminSession.json()).toMatchObject({
      canManage: true,
      user: {
        createdAt: expect.any(String),
        email: "admin@example.com",
        emailVerified: true,
        image: null,
        name: "Admin",
        passkeyCount: 0,
        twoFactorState: "disabled",
      },
    });

    const password = "another secure password";
    const created = await app.request(
      "/api/dashboard/users",
      {
        body: JSON.stringify({
          email: "member@example.com",
          name: "Member",
          password,
        }),
        headers: {
          cookie: adminCookie,
          "content-type": "application/json",
        },
        method: "POST",
      },
      bindings,
    );
    expect(created.status).toBe(201);
    const listed = await app.request(
      "/api/dashboard/users",
      { headers: { cookie: adminCookie } },
      bindings,
    );
    expect(listed.status).toBe(200);
    const body: unknown = await listed.json();
    expect(body).toMatchObject({
      users: expect.arrayContaining([
        expect.objectContaining({ email: "member@example.com" }),
      ]),
    });

    const memberCookie = await signIn(bindings, "member@example.com", password);
    const memberSession = await app.request(
      "/api/dashboard/session",
      { headers: { cookie: memberCookie } },
      bindings,
    );
    expect(memberSession.status).toBe(200);
    expect(await memberSession.json()).toMatchObject({
      canManage: false,
      user: {
        email: "member@example.com",
        name: "Member",
        passkeyCount: 0,
        twoFactorState: "disabled",
      },
    });

    const forbidden = await app.request(
      "/api/dashboard/users",
      { headers: { cookie: memberCookie } },
      bindings,
    );
    expect(forbidden.status).toBe(403);
  });

  it("scopes the complete Application lifecycle to dashboard API links", async () => {
    const cookie = await bootstrapAndSignIn(bindings);
    const app = createApp();
    const headers = { cookie, "content-type": "application/json" };
    const apiResponse = await app.request(
      "/api/dashboard/apis",
      {
        body: JSON.stringify({
          description: "Protected resource",
          identifier: "https://api.example.com/",
          name: "Core API",
        }),
        headers,
        method: "POST",
      },
      bindings,
    );
    expect(apiResponse.status).toBe(201);
    const apiValue: unknown = await apiResponse.json();
    if (
      apiValue === null ||
      typeof apiValue !== "object" ||
      !("api" in apiValue) ||
      apiValue.api === null ||
      typeof apiValue.api !== "object" ||
      !("id" in apiValue.api) ||
      typeof apiValue.api.id !== "string"
    ) {
      throw new Error("The API response did not match its contract.");
    }
    const applicationResponse = await app.request(
      "/api/dashboard/applications",
      {
        body: JSON.stringify({
          apiId: apiValue.api.id,
          name: "Web Application",
          redirectUris: ["chikara://"],
          type: "web",
        }),
        headers,
        method: "POST",
      },
      bindings,
    );
    expect(applicationResponse.status).toBe(201);
    const applicationValue: unknown = await applicationResponse.json();
    if (
      applicationValue === null ||
      typeof applicationValue !== "object" ||
      !("application" in applicationValue) ||
      applicationValue.application === null ||
      typeof applicationValue.application !== "object" ||
      !("clientId" in applicationValue.application) ||
      typeof applicationValue.application.clientId !== "string" ||
      !("credential" in applicationValue) ||
      typeof applicationValue.credential !== "string"
    ) {
      throw new Error("The Application response did not match its contract.");
    }
    const clientId = applicationValue.application.clientId;
    expect(clientId).toMatch(/^otakuma_[\w-]{32}$/);
    expect(applicationValue.credential).toMatch(/^otakuma_cs_/);
    expect(
      await bindings.AUTH_DB.prepare(
        "SELECT referenceId FROM oauthClient WHERE clientId = ?",
      )
        .bind(clientId)
        .first<{ referenceId: string }>(),
    ).toEqual({ referenceId: "otakuma:auth-dashboard" });

    const listed = await app.request(
      "/api/dashboard/applications",
      { headers },
      bindings,
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      applications: [
        expect.objectContaining({
          clientId,
          createdAt: expect.any(Number),
          redirectUris: ["chikara://"],
          updatedAt: expect.any(Number),
        }),
      ],
    });

    await bindings.AUTH_DB.prepare(
      `INSERT INTO oauthClient
       (id, clientId, redirectUris, referenceId, type, public, disabled)
       VALUES ('rogue-row', 'rogue-client', '[]', 'chikara:auth-dashboard', 'web', 0, 0)`,
    ).run();
    const rogueDelete = await app.request(
      "/api/dashboard/applications/rogue-client",
      { headers: { cookie }, method: "DELETE" },
      bindings,
    );
    expect(rogueDelete.status).toBe(404);

    const rotated = await app.request(
      `/api/dashboard/applications/${clientId}/rotate`,
      { headers: { cookie }, method: "POST" },
      bindings,
    );
    expect(rotated.status).toBe(200);
    const rotatedValue: unknown = await rotated.json();
    expect(rotatedValue).toMatchObject({
      credential: expect.stringMatching(/^otakuma_cs_/),
    });

    const removed = await app.request(
      `/api/dashboard/applications/${clientId}`,
      { headers: { cookie }, method: "DELETE" },
      bindings,
    );
    expect(removed.status).toBe(200);
    const deleted = await bindings.AUTH_DB.prepare(
      "SELECT clientId FROM oauthClient WHERE clientId = ?",
    )
      .bind(clientId)
      .first<{ clientId: string }>();
    expect(deleted).toBeNull();
  });
});
