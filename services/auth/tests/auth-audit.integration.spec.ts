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

interface EventRow {
  readonly actorUserId: string | null;
  readonly eventType: string;
  readonly subjectUserId: string;
}

function decodeBase32(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("The TOTP secret was not base32 encoded.");
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("The auth response did not set a cookie.");
  return header.split(";", 1)[0] ?? "";
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(";", 1)[0] ?? "")
    .filter(Boolean)
    .join("; ");
}

async function authRequest(
  bindings: AuthBindings,
  path: string,
  body: object,
  cookie?: string,
): Promise<Response> {
  const headers = new Headers({
    "content-type": "application/json",
    origin: "http://localhost:4321",
  });
  if (cookie) headers.set("cookie", cookie);
  return (await Effect.runPromise(createTestAuth(bindings))).handler(
    new Request(`http://localhost:8787/api/auth${path}`, {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    }),
  );
}

async function events(
  bindings: AuthBindings,
): Promise<ReadonlyArray<EventRow>> {
  return (
    await bindings.AUTH_DB.prepare(
      `SELECT actorUserId, eventType, subjectUserId
       FROM authAuditEvent ORDER BY occurredAt ASC, id ASC`,
    ).all<EventRow>()
  ).results;
}

async function bootstrapAdmin(bindings: AuthBindings): Promise<string> {
  const token = "auth_audit_bootstrap_token_value";
  const password = "correct horse battery staple";
  await bindings.AUTH_BOOTSTRAP.put(
    BOOTSTRAP_KEY,
    JSON.stringify({ digest: await Effect.runPromise(digest(token)) }),
  );
  await Effect.runPromise(
    bootstrapSuperuser(bindings, {
      email: "admin@example.com",
      name: "Admin",
      password,
      token,
    }),
  );
  const response = await authRequest(bindings, "/sign-in/email", {
    email: "admin@example.com",
    password,
  });
  expect(response.status).toBe(200);
  return sessionCookie(response);
}

describe("auth account activity", () => {
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

  it("records only successful signup, login, and password changes", async () => {
    const password = "another secure password";
    const signedUp = await authRequest(bindings, "/sign-up/email", {
      email: "member@example.com",
      name: "Member",
      password,
    });
    expect(signedUp.status).toBe(200);
    const cookie = sessionCookie(signedUp);
    const created = await events(bindings);
    expect(created.map(({ eventType }) => eventType)).toEqual([
      "account.signed_up",
    ]);
    expect(created[0]?.actorUserId).toBe(created[0]?.subjectUserId);

    const duplicate = await authRequest(bindings, "/sign-up/email", {
      email: "member@example.com",
      name: "Member",
      password,
    });
    expect(duplicate.status).not.toBe(200);
    const rejected = await authRequest(bindings, "/sign-in/email", {
      email: "member@example.com",
      password: "wrong password",
    });
    expect(rejected.status).toBe(401);
    expect(await events(bindings)).toHaveLength(1);

    const signedIn = await authRequest(bindings, "/sign-in/email", {
      email: "member@example.com",
      password,
    });
    expect(signedIn.status).toBe(200);
    const changed = await authRequest(
      bindings,
      "/change-password",
      {
        currentPassword: password,
        newPassword: "a newly secured password",
      },
      cookie,
    );
    expect(changed.status).toBe(200);
    expect((await events(bindings)).map(({ eventType }) => eventType)).toEqual([
      "account.signed_up",
      "login.succeeded",
      "password.changed",
    ]);
  });

  it("records a login only after the second factor completes", async () => {
    const password = "another secure password";
    const signedUp = await authRequest(bindings, "/sign-up/email", {
      email: "member@example.com",
      name: "Member",
      password,
    });
    const cookie = sessionCookie(signedUp);
    const enabled = await authRequest(
      bindings,
      "/two-factor/enable",
      { password },
      cookie,
    );
    const enabledValue: unknown = await enabled.json();
    if (
      enabledValue === null ||
      typeof enabledValue !== "object" ||
      !("totpURI" in enabledValue) ||
      typeof enabledValue.totpURI !== "string"
    ) {
      throw new Error("The enrollment response did not include a TOTP URI.");
    }
    const encodedSecret = new URL(enabledValue.totpURI).searchParams.get(
      "secret",
    );
    if (!encodedSecret) throw new Error("The TOTP URI omitted its secret.");
    const auth = await Effect.runPromise(createTestAuth(bindings));
    const secret = decodeBase32(encodedSecret);
    const enrollmentCode = (await auth.api.generateTOTP({ body: { secret } }))
      .code;
    const verified = await authRequest(
      bindings,
      "/two-factor/verify-totp",
      { code: enrollmentCode },
      cookie,
    );
    expect(verified.status).toBe(200);

    const challenged = await authRequest(bindings, "/sign-in/email", {
      email: "member@example.com",
      password,
    });
    expect(await challenged.clone().json()).toMatchObject({
      twoFactorRedirect: true,
    });
    expect(
      (await events(bindings)).filter(
        ({ eventType }) => eventType === "login.succeeded",
      ),
    ).toHaveLength(0);

    const challengeCookie = cookieHeader(challenged);
    const signInCode = (await auth.api.generateTOTP({ body: { secret } })).code;
    const completed = await authRequest(
      bindings,
      "/two-factor/verify-totp",
      { code: signInCode },
      challengeCookie,
    );
    expect(completed.status).toBe(200);
    expect(
      (await events(bindings)).filter(
        ({ eventType }) => eventType === "login.succeeded",
      ),
    ).toHaveLength(1);
  });

  it("keeps authentication successful when activity storage is unavailable", async () => {
    await authRequest(bindings, "/sign-up/email", {
      email: "member@example.com",
      name: "Member",
      password: "another secure password",
    });
    await bindings.AUTH_DB.prepare("DROP TABLE authAuditEvent").run();

    const response = await authRequest(bindings, "/sign-in/email", {
      email: "member@example.com",
      password: "another secure password",
    });

    expect(response.status).toBe(200);
  });

  it("exposes a bounded profile history only to the administrator", async () => {
    const adminCookie = await bootstrapAdmin(bindings);
    const app = createApp();
    const created = await app.request(
      "/api/dashboard/users",
      {
        body: JSON.stringify({
          email: "member@example.com",
          name: "Member",
          password: "another secure password",
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
    const createdBody = await created.json<{ user: { id: string } }>();
    const userId = createdBody.user.id;
    const memberCookie = sessionCookie(
      await authRequest(bindings, "/sign-in/email", {
        email: "member@example.com",
        password: "another secure password",
      }),
    );

    const signedOut = await app.request(
      `/api/dashboard/users/${userId}`,
      undefined,
      bindings,
    );
    expect(signedOut.status).toBe(401);
    const member = await app.request(
      `/api/dashboard/users/${userId}`,
      { headers: { cookie: memberCookie } },
      bindings,
    );
    expect(member.status).toBe(403);
    const missing = await app.request(
      "/api/dashboard/users/missing",
      { headers: { cookie: adminCookie } },
      bindings,
    );
    expect(missing.status).toBe(404);

    const profile = await app.request(
      `/api/dashboard/users/${userId}`,
      { headers: { cookie: adminCookie } },
      bindings,
    );
    expect(profile.status).toBe(200);
    expect(profile.headers.get("cache-control")).toBe("no-store");
    const value = await profile.json();
    expect(value).toMatchObject({
      activity: {
        events: expect.arrayContaining([
          expect.objectContaining({
            actorName: "Admin",
            eventType: "account.provisioned",
          }),
          expect.objectContaining({ eventType: "login.succeeded" }),
        ]),
        nextCursor: null,
      },
      user: {
        administrator: false,
        email: "member@example.com",
        sessionCount: 1,
      },
    });
    expect(JSON.stringify(value)).not.toMatch(
      /password|twoFactor|passkey|recoveryCodes|sessionToken/i,
    );
  });
});
