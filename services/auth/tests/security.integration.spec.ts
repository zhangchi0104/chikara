import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth.js";
import type { AuthBindings } from "../src/configs/auth.config.js";
import {
  BOOTSTRAP_KEY,
  bootstrapSuperuser,
} from "../src/dashboard/dashboard.auth.js";
import { digest } from "../src/dashboard/dashboard.crypto.js";
import { applyAuthMigrations } from "./auth-database.js";

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("The sign-in response did not set a cookie.");
  return header.split(";", 1)[0] ?? "";
}

function decodeBase32(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("The TOTP URI contained an invalid secret.");
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

async function signIn(bindings: AuthBindings): Promise<string> {
  const token = "chikara_security_bootstrap_value";
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
  const response = await (await createAuth(bindings)).handler(
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

async function signUpMember(bindings: AuthBindings): Promise<string> {
  const response = await (await createAuth(bindings)).handler(
    new Request("http://localhost:8787/api/auth/sign-up/email", {
      body: JSON.stringify({
        email: "member@example.com",
        name: "Member",
        password: "another secure password",
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

describe("auth security integrations", () => {
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

  it("returns WebAuthn registration options for an authenticated user", async () => {
    const cookie = await signIn(bindings);
    const auth = await createAuth(bindings);
    const response = await auth.handler(
      new Request(
        "http://localhost:8787/api/auth/passkey/generate-register-options",
        { headers: { cookie, origin: "http://localhost:4321" } },
      ),
    );

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      challenge: expect.any(String),
      rp: { id: "localhost", name: "Otakuma Auth" },
      user: { name: "admin@example.com" },
    });
  });

  it("lets an ordinary member enroll TOTP and challenges later sign-ins", async () => {
    const cookie = await signUpMember(bindings);
    const auth = await createAuth(bindings);
    const enabled = await auth.handler(
      new Request("http://localhost:8787/api/auth/two-factor/enable", {
        body: JSON.stringify({ password: "another secure password" }),
        headers: {
          cookie,
          "content-type": "application/json",
          origin: "http://localhost:4321",
        },
        method: "POST",
      }),
    );

    expect(enabled.status, await enabled.clone().text()).toBe(200);
    const enabledBody: unknown = await enabled.json();
    if (
      enabledBody === null ||
      typeof enabledBody !== "object" ||
      !("totpURI" in enabledBody) ||
      typeof enabledBody.totpURI !== "string" ||
      !("backupCodes" in enabledBody) ||
      !Array.isArray(enabledBody.backupCodes) ||
      !enabledBody.backupCodes.every((code) => typeof code === "string")
    ) {
      throw new Error(
        "The 2FA enrollment response did not include a TOTP URI.",
      );
    }
    const totpUri = new URL(enabledBody.totpURI);
    expect(totpUri.searchParams.get("issuer")).toBe("Otakuma Auth");
    expect(decodeURIComponent(totpUri.pathname)).toContain("Otakuma Auth");
    const secret = totpUri.searchParams.get("secret");
    if (!secret) throw new Error("The TOTP URI did not include a secret.");
    const initialBackupCodes = enabledBody.backupCodes;

    const generated = await auth.api.generateTOTP({
      body: { secret: decodeBase32(secret) },
    });
    const verified = await auth.handler(
      new Request("http://localhost:8787/api/auth/two-factor/verify-totp", {
        body: JSON.stringify({ code: generated.code }),
        headers: {
          cookie,
          "content-type": "application/json",
          origin: "http://localhost:4321",
        },
        method: "POST",
      }),
    );

    expect(verified.status).toBe(200);
    const verifiedCookie = sessionCookie(verified);
    expect(await verified.json()).toMatchObject({
      token: expect.any(String),
    });
    const user = await bindings.AUTH_DB.prepare(
      'SELECT id, twoFactorEnabled FROM "user" WHERE email = ?',
    )
      .bind("member@example.com")
      .first<{ id: string; twoFactorEnabled: number }>();
    expect(user?.twoFactorEnabled).toBe(1);
    if (!user) throw new Error("The enrolled member was missing.");

    await bindings.AUTH_DB.prepare(
      `INSERT INTO "passkey"
        ("id", "name", "publicKey", "userId", "credentialID", "counter", "deviceType", "backedUp", "transports", "createdAt")
       VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`,
    )
      .bind(
        "member-passkey",
        "Phone",
        "unused-public-key",
        user.id,
        "member-credential",
        "singleDevice",
        "internal",
        new Date().toISOString(),
      )
      .run();

    const account = await createApp().request(
      "/api/dashboard/session",
      { headers: { cookie: verifiedCookie } },
      bindings,
    );
    expect(account.status).toBe(200);
    expect(await account.json()).toMatchObject({
      canManage: false,
      user: {
        email: "member@example.com",
        passkeyCount: 1,
        twoFactorState: "enabled",
      },
    });

    const challenged = await auth.handler(
      new Request("http://localhost:8787/api/auth/sign-in/email", {
        body: JSON.stringify({
          email: "member@example.com",
          password: "another secure password",
        }),
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:4321",
        },
        method: "POST",
      }),
    );
    expect(challenged.status).toBe(200);
    expect(await challenged.json()).toEqual({
      twoFactorMethods: ["passkey", "totp"],
      twoFactorRedirect: true,
    });
    const challengeCookie = challenged.headers
      .getSetCookie()
      .find((cookie) => cookie.includes("two_factor="))
      ?.split(";", 1)[0];
    if (!challengeCookie)
      throw new Error("The 2FA challenge cookie was missing.");
    const methods = await auth.handler(
      new Request("http://localhost:8787/api/auth/two-factor/methods", {
        headers: { cookie: challengeCookie, origin: "http://localhost:4321" },
      }),
    );
    expect(methods.status).toBe(200);
    expect(await methods.json()).toEqual({
      twoFactorMethods: ["passkey", "totp"],
      twoFactorRedirect: true,
    });
    const loginCode = await auth.api.generateTOTP({
      body: { secret: decodeBase32(secret) },
    });
    const completed = await auth.handler(
      new Request("http://localhost:8787/api/auth/two-factor/verify-totp", {
        body: JSON.stringify({ code: loginCode.code }),
        headers: {
          cookie: challengeCookie,
          "content-type": "application/json",
          origin: "http://localhost:4321",
        },
        method: "POST",
      }),
    );
    expect(completed.status, await completed.clone().text()).toBe(200);
    expect(await completed.json()).toMatchObject({ user: { id: user.id } });
    const loginEvents = await bindings.AUTH_DB.prepare(
      `SELECT COUNT(*) AS "count" FROM "authAuditEvent"
       WHERE "subjectUserId" = ? AND "eventType" = 'login.succeeded'`,
    )
      .bind(user.id)
      .first<{ count: number }>();
    expect(loginEvents?.count).toBe(1);

    const regenerated = await auth.handler(
      new Request(
        "http://localhost:8787/api/auth/two-factor/generate-backup-codes",
        {
          body: JSON.stringify({ password: "another secure password" }),
          headers: {
            cookie: verifiedCookie,
            "content-type": "application/json",
            origin: "http://localhost:4321",
          },
          method: "POST",
        },
      ),
    );
    expect(regenerated.status).toBe(200);
    const regeneratedBody: unknown = await regenerated.json();
    expect(regeneratedBody).toMatchObject({
      backupCodes: expect.any(Array),
      status: true,
    });
    if (
      regeneratedBody === null ||
      typeof regeneratedBody !== "object" ||
      !("backupCodes" in regeneratedBody) ||
      !Array.isArray(regeneratedBody.backupCodes)
    ) {
      throw new Error("The regenerated backup codes were missing.");
    }
    expect(regeneratedBody.backupCodes).not.toEqual(initialBackupCodes);

    const disabled = await auth.handler(
      new Request("http://localhost:8787/api/auth/two-factor/disable", {
        body: JSON.stringify({ password: "another secure password" }),
        headers: {
          cookie: verifiedCookie,
          "content-type": "application/json",
          origin: "http://localhost:4321",
        },
        method: "POST",
      }),
    );
    expect(disabled.status).toBe(200);
    const disabledCookie = sessionCookie(disabled);
    expect(await disabled.json()).toEqual({ status: true });
    const disabledAccount = await createApp().request(
      "/api/dashboard/session",
      { headers: { cookie: disabledCookie } },
      bindings,
    );
    expect(await disabledAccount.json()).toMatchObject({
      canManage: false,
      user: { twoFactorState: "disabled" },
    });
    expect(
      await bindings.AUTH_DB.prepare(
        'SELECT id FROM "twoFactor" WHERE userId = ?',
      )
        .bind(user?.id ?? "")
        .first(),
    ).toBeNull();
  });

  it("rejects unauthenticated enrollment requests", async () => {
    const auth = await createAuth(bindings);
    const unauthenticated = await auth.handler(
      new Request("http://localhost:8787/api/auth/two-factor/enable", {
        body: JSON.stringify({ password: "another secure password" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("requires password confirmation even when no credential remains", async () => {
    const cookie = await signUpMember(bindings);
    const user = await bindings.AUTH_DB.prepare(
      'SELECT "id" FROM "user" WHERE "email" = ?',
    )
      .bind("member@example.com")
      .first<{ id: string }>();
    if (!user)
      throw new Error("The passwordless test account was not created.");
    await bindings.AUTH_DB.prepare('DELETE FROM "account" WHERE "userId" = ?')
      .bind(user.id)
      .run();

    const response = await (await createAuth(bindings)).handler(
      new Request("http://localhost:8787/api/auth/two-factor/enable", {
        body: JSON.stringify({}),
        headers: {
          cookie,
          "content-type": "application/json",
          origin: "http://localhost:4321",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(
      await bindings.AUTH_DB.prepare(
        'SELECT "id" FROM "twoFactor" WHERE "userId" = ?',
      )
        .bind(user.id)
        .first(),
    ).toBeNull();
  });
});
