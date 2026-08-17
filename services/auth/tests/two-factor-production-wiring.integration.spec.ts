import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth.js";
import type { AuthBindings } from "../src/configs/auth.config.js";
import { coordinateTwoFactorRequest } from "../src/two-factor.coordination.js";
import { readTwoFactorState } from "../src/two-factor.state.js";
import { applyAuthMigrations } from "./auth-database.js";

const coordinatorUserHeader = "x-test-two-factor-user";
const email = "coordinated@example.com";
const password = "another secure password";

const coordinatorScript = `
export class TestTwoFactorCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  fetch(request) {
    return this.ctx.blockConcurrencyWhile(() => {
      const headers = new Headers(request.headers);
      headers.set("${coordinatorUserHeader}", this.ctx.id.name ?? "");
      return this.env.AUTH_HANDLER.fetch(new Request(request, { headers }));
    });
  }
}

export default { fetch() { return new Response("ok"); } };
`;

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("The response did not set a session cookie.");
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

async function enrollmentSecret(response: Response): Promise<string> {
  const value: unknown = await response.json();
  if (
    value === null ||
    typeof value !== "object" ||
    !("totpURI" in value) ||
    typeof value.totpURI !== "string"
  ) {
    throw new Error("The enrollment response did not include a TOTP URI.");
  }
  const secret = new URL(value.totpURI).searchParams.get("secret");
  if (!secret) throw new Error("The enrollment response omitted its secret.");
  return decodeBase32(secret);
}

async function requestInit(request: Request): Promise<RequestInit> {
  const init: RequestInit = {
    headers: new Headers(request.headers),
    method: request.method,
  };
  if (request.method === "GET" || request.method === "HEAD") return init;
  return { ...init, body: await request.arrayBuffer() };
}

function adaptDurableNamespace(
  namespace: AuthBindings["TWO_FACTOR_COORDINATOR"],
): AuthBindings["TWO_FACTOR_COORDINATOR"] {
  // Hono and Miniflare use different Request implementations in Node tests.
  // Keep the real namespace/stub and adapt only the fetch boundary.
  return new Proxy(namespace, {
    get(target, property) {
      if (property !== "getByName") {
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (name: string) => {
        const stub = target.getByName(name);
        return new Proxy(stub, {
          get(stubTarget, stubProperty) {
            if (stubProperty !== "fetch") {
              const value = Reflect.get(stubTarget, stubProperty, stubTarget);
              return typeof value === "function"
                ? value.bind(stubTarget)
                : value;
            }
            return async (request: Request) =>
              stubTarget.fetch(request.url, await requestInit(request));
          },
        });
      };
    },
  });
}

describe("two-factor production wiring", () => {
  let bindings: AuthBindings;
  let cookie: string;
  let miniflare: Miniflare;
  let userId: string;

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
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["AUTH_DB"],
        durableObjects: {
          TWO_FACTOR_COORDINATOR: "TestTwoFactorCoordinator",
        },
        kvNamespaces: ["AUTH_BOOTSTRAP"],
        modules: true,
        script: coordinatorScript,
        serviceBindings: {
          AUTH_HANDLER: async (request, worker) => {
            const workerBindings = await worker.getBindings<AuthBindings>();
            const coordinatedUserId = request.headers.get(
              coordinatorUserHeader,
            );
            if (!coordinatedUserId) {
              return Response.json(
                { code: "TEST_COORDINATOR_ERROR" },
                { status: 500 },
              );
            }
            const headers = new Headers(request.headers);
            headers.delete(coordinatorUserHeader);
            const forwardedInit: RequestInit = {
              headers,
              method: request.method,
            };
            if (request.method !== "GET" && request.method !== "HEAD") {
              forwardedInit.body = await request.arrayBuffer();
            }
            const forwarded = new Request(request.url, forwardedInit);
            const auth = await createAuth(workerBindings);
            return coordinateTwoFactorRequest(
              forwarded,
              workerBindings.AUTH_DB,
              coordinatedUserId,
              (requestToHandle) => auth.handler(requestToHandle),
            );
          },
        },
      }),
    );
    const workerBindings = await miniflare.getBindings<AuthBindings>();
    bindings = {
      ...workerBindings,
      TWO_FACTOR_COORDINATOR: adaptDurableNamespace(
        workerBindings.TWO_FACTOR_COORDINATOR,
      ),
    };
    await applyAuthMigrations(bindings.AUTH_DB);
    const signedUp = await request("/api/auth/sign-up/email", undefined, {
      email,
      name: "Coordinated Member",
      password,
    });
    expect(signedUp.status).toBe(200);
    cookie = sessionCookie(signedUp);
    const user = await bindings.AUTH_DB.prepare(
      'SELECT "id" FROM "user" WHERE "email" = ?',
    )
      .bind(email)
      .first<{ id: string }>();
    if (!user) throw new Error("The coordinated account was not created.");
    userId = user.id;
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  async function request(
    path: string,
    session: string | undefined,
    body: object,
  ): Promise<Response> {
    const headers = new Headers({
      "content-type": "application/json",
      origin: "http://localhost:4321",
    });
    if (session) headers.set("cookie", session);
    return createApp().request(
      `http://localhost:8787${path}`,
      { body: JSON.stringify(body), headers, method: "POST" },
      bindings,
    );
  }

  async function signIn(signInPassword: string): Promise<Response> {
    return createApp().request(
      "http://localhost:8787/api/auth/sign-in/email",
      {
        body: JSON.stringify({ email, password: signInPassword }),
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:4321",
        },
        method: "POST",
      },
      bindings,
    );
  }

  async function signInForm(signInPassword: string): Promise<Response> {
    return createApp().request(
      "http://localhost:8787/api/auth/sign-in/email",
      {
        body: new URLSearchParams({ email, password: signInPassword }),
        method: "POST",
      },
      bindings,
    );
  }

  it("serializes enrollment and forwards cookies through the coordinator", async () => {
    const enroll = () =>
      request("/api/auth/two-factor/enable", cookie, { password });
    const responses = await Promise.all([enroll(), enroll()]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const conflict = responses.find(({ status }) => status === 409);
    expect(await conflict?.json()).toMatchObject({
      code: "TWO_FACTOR_SETUP_PENDING",
    });
    expect(await readTwoFactorState(bindings.AUTH_DB, userId)).toBe("pending");
    expect(
      await bindings.AUTH_DB.prepare(
        'SELECT COUNT(*) AS "count" FROM "twoFactor" WHERE "userId" = ?',
      )
        .bind(userId)
        .first<{ count: number }>(),
    ).toEqual({ count: 1 });

    const disabled = await request("/api/auth/two-factor/disable", cookie, {
      password,
    });
    expect(disabled.status, await disabled.clone().text()).toBe(200);
    const rotatedCookie = sessionCookie(disabled);
    const account = await createApp().request(
      "http://localhost:8787/api/dashboard/session",
      { headers: { cookie: rotatedCookie } },
      bindings,
    );
    expect(account.status).toBe(200);
    expect(await account.json()).toMatchObject({
      user: { twoFactorState: "disabled" },
    });
  });

  it("rejects replacement after an authenticator has been verified", async () => {
    const enrolled = await request("/api/auth/two-factor/enable", cookie, {
      password,
    });
    expect(enrolled.status).toBe(200);
    const secret = await enrollmentSecret(enrolled);
    const auth = await createAuth(bindings);
    const generated = await auth.api.generateTOTP({ body: { secret } });
    const verified = await request("/api/auth/two-factor/verify-totp", cookie, {
      code: generated.code,
    });
    expect(verified.status).toBe(200);
    const verifiedCookie = sessionCookie(verified);
    const stored = await bindings.AUTH_DB.prepare(
      'SELECT "secret" FROM "twoFactor" WHERE "userId" = ?',
    )
      .bind(userId)
      .first<{ secret: string }>();

    const replacement = await request(
      "/api/auth/two-factor/enable",
      verifiedCookie,
      { password },
    );

    expect(replacement.status).toBe(409);
    expect(await replacement.json()).toMatchObject({
      code: "TWO_FACTOR_ALREADY_ENABLED",
    });
    expect(
      await bindings.AUTH_DB.prepare(
        'SELECT "secret" FROM "twoFactor" WHERE "userId" = ?',
      )
        .bind(userId)
        .first<{ secret: string }>(),
    ).toEqual(stored);
  });

  it("recovers a signed-out account whose enabled factor is missing", async () => {
    await bindings.AUTH_DB.batch([
      bindings.AUTH_DB.prepare(
        'UPDATE "user" SET "twoFactorEnabled" = 1 WHERE "id" = ?',
      ).bind(userId),
      bindings.AUTH_DB.prepare('DELETE FROM "session" WHERE "userId" = ?').bind(
        userId,
      ),
    ]);
    expect(await readTwoFactorState(bindings.AUTH_DB, userId)).toBe(
      "inconsistent",
    );

    const rejected = await signIn("wrong password");
    expect(rejected.status).toBe(401);
    expect(await readTwoFactorState(bindings.AUTH_DB, userId)).toBe(
      "inconsistent",
    );

    const recovered = await signInForm(password);
    expect(recovered.status, await recovered.clone().text()).toBe(200);
    const recoveredCookie = sessionCookie(recovered);
    expect(await readTwoFactorState(bindings.AUTH_DB, userId)).toBe("disabled");
    const account = await createApp().request(
      "http://localhost:8787/api/dashboard/session",
      { headers: { cookie: recoveredCookie } },
      bindings,
    );
    expect(account.status).toBe(200);
    expect(await account.json()).toMatchObject({
      user: { email, twoFactorState: "disabled" },
    });
  });

  it("does not bypass a conflicted state containing a verified factor", async () => {
    await bindings.AUTH_DB.batch([
      bindings.AUTH_DB.prepare('DROP INDEX "twoFactor_userId_unique_idx"'),
      bindings.AUTH_DB.prepare(
        'UPDATE "user" SET "twoFactorEnabled" = 1 WHERE "id" = ?',
      ).bind(userId),
      bindings.AUTH_DB.prepare('DELETE FROM "session" WHERE "userId" = ?').bind(
        userId,
      ),
      bindings.AUTH_DB.prepare(
        'INSERT INTO "twoFactor" (id, secret, backupCodes, userId, verified) VALUES (?, ?, ?, ?, 1)',
      ).bind("verified-factor", "verified-secret", "codes", userId),
      bindings.AUTH_DB.prepare(
        'INSERT INTO "twoFactor" (id, secret, backupCodes, userId, verified) VALUES (?, ?, ?, ?, 0)',
      ).bind("pending-factor", "pending-secret", "codes", userId),
    ]);
    expect(await readTwoFactorState(bindings.AUTH_DB, userId)).toBe(
      "inconsistent",
    );

    const challenged = await signIn(password);

    expect(challenged.status).toBe(200);
    expect(await challenged.json()).toMatchObject({
      twoFactorRedirect: true,
    });
    expect(await readTwoFactorState(bindings.AUTH_DB, userId)).toBe(
      "inconsistent",
    );
    expect(
      await bindings.AUTH_DB.prepare(
        'SELECT COUNT(*) AS "count" FROM "twoFactor" WHERE "userId" = ?',
      )
        .bind(userId)
        .first<{ count: number }>(),
    ).toEqual({ count: 2 });
  });
});
