import { Effect } from "effect";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthBindings } from "../src/configs/auth.config.js";
import { applyAuthMigrations } from "./auth-database.js";
import { createTestAuth } from "./auth-runtime.js";
import { createTestPasskey, type TestPasskey } from "./webauthn-fixture.js";

const email = "passkey-member@example.com";
const password = "another secure password";
const origin = "http://localhost:4321";
const openAuth = (bindings: AuthBindings) =>
  Effect.runPromise(createTestAuth(bindings));

async function signUp(
  bindings: AuthBindings,
  account: { readonly email: string; readonly password: string } = {
    email,
    password,
  },
): Promise<string> {
  const response = await (await openAuth(bindings)).handler(
    new Request("http://localhost:8787/api/auth/sign-up/email", {
      body: JSON.stringify({
        email: account.email,
        name: "Passkey Member",
        password: account.password,
      }),
      headers: { "content-type": "application/json", origin },
      method: "POST",
    }),
  );
  expect(response.status).toBe(200);
  const user = await bindings.AUTH_DB.prepare(
    'SELECT "id" FROM "user" WHERE "email" = ?',
  )
    .bind(account.email)
    .first<{ id: string }>();
  if (!user) throw new Error("The passkey test user was not created.");
  return user.id;
}

async function addPasskey(
  bindings: AuthBindings,
  userId: string,
  passkey: Pick<TestPasskey, "credentialId" | "publicKey"> = {
    credentialId: "fixture-credential",
    publicKey: "fixture-public-key",
  },
): Promise<void> {
  await bindings.AUTH_DB.prepare(
    `INSERT INTO "passkey"
      ("id", "name", "publicKey", "userId", "credentialID", "counter", "deviceType", "backedUp", "transports", "createdAt")
     VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`,
  )
    .bind(
      `passkey-${passkey.credentialId}`,
      "Phone",
      passkey.publicKey,
      userId,
      passkey.credentialId,
      "singleDevice",
      "internal",
      new Date().toISOString(),
    )
    .run();
}

function responseCookies(...responses: ReadonlyArray<Response>): string {
  const cookies = new Map<string, string>();
  for (const response of responses) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      if (!pair) continue;
      cookies.set(pair.split("=", 1)[0] ?? pair, pair);
    }
  }
  return [...cookies.values()].join("; ");
}

async function passwordSignIn(bindings: AuthBindings): Promise<Response> {
  return (await openAuth(bindings)).handler(
    new Request("http://localhost:8787/api/auth/sign-in/email", {
      body: JSON.stringify({ email, password }),
      headers: { "content-type": "application/json", origin },
      method: "POST",
    }),
  );
}

async function authenticationChallenge(
  bindings: AuthBindings,
  cookie: string,
): Promise<{ readonly challenge: string; readonly response: Response }> {
  const response = await (await openAuth(bindings)).handler(
    new Request(
      "http://localhost:8787/api/auth/passkey/generate-authenticate-options",
      { headers: { cookie, origin } },
    ),
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const body: unknown = await response.clone().json();
  if (
    body === null ||
    typeof body !== "object" ||
    !("challenge" in body) ||
    typeof body.challenge !== "string"
  ) {
    throw new Error("The WebAuthn challenge was missing.");
  }
  return { challenge: body.challenge, response };
}

async function verifyPasskey(
  bindings: AuthBindings,
  cookie: string,
  response: object,
): Promise<Response> {
  return (await openAuth(bindings)).handler(
    new Request(
      "http://localhost:8787/api/auth/passkey/verify-authentication",
      {
        body: JSON.stringify({ response }),
        headers: { cookie, "content-type": "application/json", origin },
        method: "POST",
      },
    ),
  );
}

async function verifyTwoFactor(
  bindings: AuthBindings,
  cookie: string,
  method: "verify-backup-code" | "verify-totp",
): Promise<Response> {
  return (await openAuth(bindings)).handler(
    new Request(`http://localhost:8787/api/auth/two-factor/${method}`, {
      body: JSON.stringify({ code: "unused-code" }),
      headers: { cookie, "content-type": "application/json", origin },
      method: "POST",
    }),
  );
}

async function sessionCount(
  bindings: AuthBindings,
  userId: string,
): Promise<number> {
  const row = await bindings.AUTH_DB.prepare(
    'SELECT COUNT(*) AS "count" FROM "session" WHERE "userId" = ?',
  )
    .bind(userId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

describe("passkey multi-factor authentication", () => {
  let miniflare: Miniflare;
  let bindings: AuthBindings;

  beforeEach(async () => {
    miniflare = new Miniflare(
      convertV4MiniflareOptions({
        bindings: {
          AUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION: "false",
          AUTH_PASSKEY_RP_ID: "localhost",
          AUTH_TRUSTED_ORIGINS: origin,
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
  it("requires a registered passkey after a successful password", async () => {
    const userId = await signUp(bindings);
    await addPasskey(bindings, userId);
    const sessionsBefore = await sessionCount(bindings, userId);
    const response = await passwordSignIn(bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      twoFactorMethods: ["passkey"],
      twoFactorRedirect: true,
    });
    expect(await sessionCount(bindings, userId)).toBe(sessionsBefore);
  });
  it("limits password step-up options to the challenged user's passkeys", async () => {
    const userId = await signUp(bindings);
    await addPasskey(bindings, userId);
    const challenged = await passwordSignIn(bindings);
    const response = await (await openAuth(bindings)).handler(
      new Request(
        "http://localhost:8787/api/auth/passkey/generate-authenticate-options",
        {
          headers: { cookie: responseCookies(challenged), origin },
        },
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      allowCredentials: [{ id: "fixture-credential" }],
      userVerification: "preferred",
    });
  });
  it("requires user verification for passkey-first sign-in", async () => {
    const response = await (await openAuth(bindings)).handler(
      new Request(
        "http://localhost:8787/api/auth/passkey/generate-authenticate-options",
        { headers: { origin } },
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      userVerification: "required",
    });
  });
  it("completes passkey-first sign-in without another challenge", async () => {
    const userId = await signUp(bindings);
    const passkey = await createTestPasskey();
    await addPasskey(bindings, userId, passkey);
    const sessionsBefore = await sessionCount(bindings, userId);
    const rejectedOptions = await authenticationChallenge(bindings, "");
    const rejectedAssertion = await passkey.authenticationResponse({
      challenge: rejectedOptions.challenge,
      origin,
      rpId: "localhost",
      userVerified: false,
    });
    const rejected = await verifyPasskey(
      bindings,
      responseCookies(rejectedOptions.response),
      rejectedAssertion,
    );
    expect(rejected.status).toBe(401);
    expect(await sessionCount(bindings, userId)).toBe(sessionsBefore);
    const options = await authenticationChallenge(bindings, "");
    const assertion = await passkey.authenticationResponse({
      challenge: options.challenge,
      origin,
      rpId: "localhost",
    });
    const response = await verifyPasskey(
      bindings,
      responseCookies(options.response),
      assertion,
    );
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({ user: { id: userId } });
  });
  it("offers a verified authenticator as an alternative to Passkey", async () => {
    const userId = await signUp(bindings);
    await addPasskey(bindings, userId);
    await bindings.AUTH_DB.batch([
      bindings.AUTH_DB.prepare(
        `INSERT INTO "twoFactor"
          ("id", "secret", "backupCodes", "userId", "verified")
         VALUES (?, ?, ?, ?, 1)`,
      ).bind("verified-factor", "unused-secret", "unused-codes", userId),
      bindings.AUTH_DB.prepare(
        'UPDATE "user" SET "twoFactorEnabled" = 1 WHERE "id" = ?',
      ).bind(userId),
    ]);
    const response = await passwordSignIn(bindings);
    expect(await response.json()).toEqual({
      twoFactorMethods: ["passkey", "totp"],
      twoFactorRedirect: true,
    });
  });
  it("rejects a different account's passkey during password step-up", async () => {
    const challengedUserId = await signUp(bindings);
    const challengedPasskey = await createTestPasskey();
    await addPasskey(bindings, challengedUserId, challengedPasskey);
    const otherAccount = {
      email: "other-passkey-member@example.com",
      password: "different secure password",
    };
    const otherUserId = await signUp(bindings, otherAccount);
    const otherPasskey = await createTestPasskey();
    await addPasskey(bindings, otherUserId, otherPasskey);
    const challenged = await passwordSignIn(bindings);
    const options = await authenticationChallenge(
      bindings,
      responseCookies(challenged),
    );
    const assertion = await otherPasskey.authenticationResponse({
      challenge: options.challenge,
      origin,
      rpId: "localhost",
    });
    const verified = await verifyPasskey(
      bindings,
      responseCookies(challenged, options.response),
      assertion,
    );
    expect(verified.status).toBe(401);
  });
  it("accepts user presence after the password factor", async () => {
    const userId = await signUp(bindings);
    const passkey = await createTestPasskey();
    await addPasskey(bindings, userId, passkey);
    const challenged = await passwordSignIn(bindings);
    const options = await authenticationChallenge(
      bindings,
      responseCookies(challenged),
    );
    const assertion = await passkey.authenticationResponse({
      challenge: options.challenge,
      origin,
      rpId: "localhost",
      userVerified: false,
    });
    const verified = await verifyPasskey(
      bindings,
      responseCookies(challenged, options.response),
      assertion,
    );
    expect(verified.status, await verified.clone().text()).toBe(200);
  });
  it("consumes the password challenge after a valid passkey", async () => {
    const userId = await signUp(bindings);
    const passkey = await createTestPasskey();
    await addPasskey(bindings, userId, passkey);
    const challenged = await passwordSignIn(bindings);
    const challengeCookie = responseCookies(challenged);
    const options = await authenticationChallenge(bindings, challengeCookie);
    const assertion = await passkey.authenticationResponse({
      challenge: options.challenge,
      origin,
      rpId: "localhost",
    });

    const verified = await verifyPasskey(
      bindings,
      responseCookies(challenged, options.response),
      assertion,
    );
    expect(verified.status, await verified.clone().text()).toBe(200);
    expect(await verified.json()).toMatchObject({
      user: { id: userId },
    });

    const replay = await (await openAuth(bindings)).handler(
      new Request(
        "http://localhost:8787/api/auth/passkey/generate-authenticate-options",
        { headers: { cookie: challengeCookie, origin } },
      ),
    );
    expect(replay.status).toBe(401);
  });

  it("rejects inactive authenticator methods during Passkey step-up", async () => {
    const userId = await signUp(bindings);
    const passkey = await createTestPasskey();
    await addPasskey(bindings, userId, passkey);
    await bindings.AUTH_DB.prepare(
      `INSERT INTO "twoFactor"
        ("id", "secret", "backupCodes", "userId", "verified")
       VALUES (?, ?, ?, ?, 0)`,
    )
      .bind("pending-factor", "pending-secret", "pending-codes", userId)
      .run();
    const challenged = await passwordSignIn(bindings);

    const challengeCookie = responseCookies(challenged);
    const recovery = await verifyTwoFactor(
      bindings,
      challengeCookie,
      "verify-backup-code",
    );
    expect(recovery.status).toBe(401);
    expect(await recovery.json()).toMatchObject({
      code: "TWO_FACTOR_RECOVERY_NOT_ENROLLED",
    });
    await bindings.AUTH_DB.prepare(
      'UPDATE "twoFactor" SET "verified" = 1 WHERE "userId" = ?',
    )
      .bind(userId)
      .run();
    const totp = await verifyTwoFactor(
      bindings,
      challengeCookie,
      "verify-totp",
    );
    expect(totp.status).toBe(401);
    expect(await totp.json()).toMatchObject({
      code: "TWO_FACTOR_TOTP_NOT_ENROLLED",
    });
  });
});
