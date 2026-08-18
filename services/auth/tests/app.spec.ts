import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createApp } from "../src/app.js";

function forwardedRequestHandler(request: Request): Effect.Effect<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/auth/two-factor/methods") {
    return Effect.succeed(
      Response.json({
        twoFactorMethods: ["totp"],
        twoFactorRedirect: true,
      }),
    );
  }
  return Effect.succeed(
    Response.json({ method: request.method, path: url.pathname }),
  );
}

describe("auth", () => {
  const app = createApp(forwardedRequestHandler);

  it.effect("reports liveness without calling Better Auth", () =>
    Effect.gen(function* () {
      const response = yield* Effect.promise(() =>
        Promise.resolve(app.request("/health")),
      );

      expect(response.status).toBe(200);
      expect(yield* Effect.promise(() => response.json())).toEqual({
        status: "ok",
      });
    }),
  );

  it.effect("identifies the OAuth provider", () =>
    Effect.gen(function* () {
      const response = yield* Effect.promise(() =>
        Promise.resolve(app.request("/")),
      );

      expect(yield* Effect.promise(() => response.json())).toEqual({
        issuer: "/api/auth",
        protocol: "OAuth 2.1",
        service: "auth",
        status: "ok",
      });
    }),
  );

  it.effect("forwards OAuth endpoints to Better Auth", () =>
    Effect.gen(function* () {
      const response = yield* Effect.promise(() =>
        Promise.resolve(
          app.request("/api/auth/oauth2/token", { method: "POST" }),
        ),
      );

      expect(yield* Effect.promise(() => response.json())).toEqual({
        method: "POST",
        path: "/api/auth/oauth2/token",
      });
    }),
  );

  it.effect("forwards the authorization server metadata alias", () =>
    Effect.gen(function* () {
      const response = yield* Effect.promise(() =>
        Promise.resolve(
          app.request("/.well-known/oauth-authorization-server/api/auth"),
        ),
      );

      expect(yield* Effect.promise(() => response.json())).toEqual({
        method: "GET",
        path: "/.well-known/oauth-authorization-server/api/auth",
      });
    }),
  );

  it.effect("serves the provider login and consent screens", () =>
    Effect.gen(function* () {
      const signIn = yield* Effect.promise(() =>
        Promise.resolve(app.request("/sign-in")),
      );
      const twoFactor = yield* Effect.promise(() =>
        Promise.resolve(app.request("/two-factor")),
      );
      const consent = yield* Effect.promise(() =>
        Promise.resolve(app.request("/consent")),
      );

      expect(signIn.headers.get("content-type") ?? "").toMatch(/text\/html/);
      const signInHtml = yield* Effect.promise(() => signIn.text());
      expect(signInHtml).toContain("<title>Sign in · Otakuma Auth</title>");
      expect(signInHtml).toMatch(/Sign in to Otakuma Auth/);
      expect(signInHtml).toContain('form method="post"');
      expect(signInHtml).toContain("payload.twoFactorRedirect === true");
      expect(signInHtml).toContain(
        "/api/auth/passkey/generate-authenticate-options",
      );
      expect(signInHtml).toContain("/api/auth/passkey/verify-authentication");
      const twoFactorHtml = yield* Effect.promise(() => twoFactor.text());
      expect(twoFactorHtml).toContain(
        "<title>Verify your sign-in · Otakuma Auth</title>",
      );
      expect(twoFactorHtml).toContain("/api/auth/two-factor/verify-totp");
      expect(twoFactorHtml).toContain(
        "/api/auth/two-factor/verify-backup-code",
      );
      expect(twoFactorHtml).toContain('name="factor"');
      const passkeyTwoFactor = yield* Effect.promise(() =>
        Promise.resolve(app.request("/two-factor?method=passkey")),
      );
      const passkeyTwoFactorHtml = yield* Effect.promise(() =>
        passkeyTwoFactor.text(),
      );
      expect(passkeyTwoFactorHtml).not.toContain(
        '<button type="button" data-passkey-verification',
      );
      expect(passkeyTwoFactorHtml).toContain(
        "/api/auth/two-factor/verify-totp",
      );
      const passkeyApp = createApp(() =>
        Effect.succeed(
          Response.json({
            twoFactorMethods: ["passkey"],
            twoFactorRedirect: true,
          }),
        ),
      );
      const authoritativePasskey = yield* Effect.promise(() =>
        Promise.resolve(passkeyApp.request("/two-factor?method=totp")),
      );
      const authoritativePasskeyHtml = yield* Effect.promise(() =>
        authoritativePasskey.text(),
      );
      expect(authoritativePasskeyHtml).toContain(
        '<button type="button" data-passkey-verification',
      );
      expect(authoritativePasskeyHtml).not.toContain(
        "/api/auth/two-factor/verify-totp",
      );
      const consentHtml = yield* Effect.promise(() => consent.text());
      expect(consentHtml).toContain("<title>Authorize · Otakuma Auth</title>");
      expect(consentHtml).toMatch(/Authorize this Application/);
      expect(consentHtml).toContain("/api/auth/oauth2/public-client-prelogin");
      expect(consentHtml).toContain("payload.client_name");
      expect(consentHtml).toContain('name="accept" value="false"');
      expect(consentHtml).toContain('name="accept" value="true"');
    }),
  );

  it.effect("continues a native password sign-in on the two-factor page", () =>
    Effect.gen(function* () {
      let forwardedRequest: Request | undefined;
      const challengeApp = createApp((request) => {
        forwardedRequest = request;
        return Effect.succeed(
          Response.json(
            { twoFactorMethods: ["totp"], twoFactorRedirect: true },
            {
              headers: {
                "set-cookie":
                  "better-auth.two_factor=challenge; HttpOnly; Path=/",
              },
            },
          ),
        );
      });
      const response = yield* Effect.promise(() =>
        Promise.resolve(
          challengeApp.request(
            "/sign-in?sig=signed&ba_param=client_id&ba_param=scope&client_id=client-1&scope=openid%20profile&unsigned=drop",
            {
              body: new URLSearchParams({
                email: "member@example.com",
                password: "secure password",
              }),
              headers: {
                "content-type": "application/x-www-form-urlencoded",
              },
              method: "POST",
            },
          ),
        ),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "http://localhost/two-factor?sig=signed&ba_param=client_id&ba_param=scope&client_id=client-1&scope=openid+profile&method=totp",
      );
      expect(response.headers.get("set-cookie")).toContain(
        "better-auth.two_factor=challenge",
      );
      expect(forwardedRequest?.url).toBe(
        "http://localhost/api/auth/sign-in/email",
      );
      if (!forwardedRequest) {
        throw new Error("Sign-in request was not forwarded");
      }
      const requestToInspect = forwardedRequest;
      expect(yield* Effect.promise(() => requestToInspect.json())).toEqual({
        email: "member@example.com",
        oauth_query:
          "sig=signed&ba_param=client_id&ba_param=scope&client_id=client-1&scope=openid+profile",
        password: "secure password",
        rememberMe: true,
      });
    }),
  );

  it.effect("resumes signed OAuth after either native two-factor method", () =>
    Effect.gen(function* () {
      const methods = [
        ["totp", "/api/auth/two-factor/verify-totp"],
        ["recovery", "/api/auth/two-factor/verify-backup-code"],
      ] as const;

      for (const [factor, endpoint] of methods) {
        let forwardedRequest: Request | undefined;
        const responseHeaders = new Headers();
        responseHeaders.append(
          "set-cookie",
          "better-auth.session_token=session; HttpOnly; Path=/",
        );
        responseHeaders.append(
          "set-cookie",
          "better-auth.two_factor=; Max-Age=0; Path=/",
        );
        const verificationApp = createApp((request) => {
          forwardedRequest = request;
          return Effect.succeed(
            Response.json(
              {
                redirect: true,
                url: "chikara://oauth/callback?code=complete",
              },
              { headers: responseHeaders },
            ),
          );
        });
        const response = yield* Effect.promise(() =>
          Promise.resolve(
            verificationApp.request(
              "/two-factor?sig=signed&ba_param=client_id&client_id=client-1&unsigned=drop",
              {
                body: new URLSearchParams({ code: "123456", factor }),
                headers: {
                  "content-type": "application/x-www-form-urlencoded",
                  cookie: "better-auth.two_factor=challenge",
                },
                method: "POST",
              },
            ),
          ),
        );

        expect(response.status).toBe(303);
        expect(response.headers.get("location")).toBe(
          "chikara://oauth/callback?code=complete",
        );
        expect(response.headers.getSetCookie()).toHaveLength(2);
        expect(forwardedRequest?.url).toBe(`http://localhost${endpoint}`);
        expect(forwardedRequest?.headers.get("cookie")).toBe(
          "better-auth.two_factor=challenge",
        );
        if (!forwardedRequest) {
          throw new Error("Two-factor request was not forwarded");
        }
        const requestToInspect = forwardedRequest;
        expect(yield* Effect.promise(() => requestToInspect.json())).toEqual({
          code: "123456",
          oauth_query: "sig=signed&ba_param=client_id&client_id=client-1",
        });
      }
    }),
  );

  it.effect("serves the account creation screen", () =>
    Effect.gen(function* () {
      const response = yield* Effect.promise(() =>
        Promise.resolve(app.request("/sign-up")),
      );

      expect(response.headers.get("content-type") ?? "").toMatch(/text\/html/);
      const html = yield* Effect.promise(() => response.text());
      expect(html).toContain("One identity. A direct route back.");
      expect(html).toContain("Otakuma Auth");
      expect(html).toContain('name="name"');
      expect(html).toContain('name="email"');
      expect(html).toContain('name="password"');
      expect(html).toContain("/api/auth/sign-up/email");
      expect(html).toContain("signInLink.search = window.location.search");
      expect(html).toContain("seed key 3e51f2d0");
    }),
  );

  it.effect("submits consent as a top-level callback redirect", () =>
    Effect.gen(function* () {
      for (const accept of [false, true]) {
        let forwardedRequest: Request | undefined;
        const consentApp = createApp((request) => {
          forwardedRequest = request;
          return Effect.succeed(
            Response.json({
              redirect: true,
              url: "chikara://oauth/callback?result=complete",
            }),
          );
        });
        const response = yield* Effect.promise(() =>
          Promise.resolve(
            consentApp.request(
              "/consent?sig=signed&ba_param=client_id&ba_param=scope&client_id=client-1&scope=openid%20profile&unsigned=drop",
              {
                body: `accept=${accept}`,
                headers: {
                  "content-type": "application/x-www-form-urlencoded",
                  cookie: "session=active",
                },
                method: "POST",
              },
            ),
          ),
        );

        expect(response.status).toBe(303);
        expect(response.headers.get("location")).toBe(
          "chikara://oauth/callback?result=complete",
        );
        expect(forwardedRequest?.url).toBe(
          "http://localhost/api/auth/oauth2/consent",
        );
        expect(forwardedRequest?.headers.get("cookie")).toBe("session=active");
        if (!forwardedRequest) {
          throw new Error("Consent request was not forwarded");
        }
        const requestToInspect = forwardedRequest;
        expect(yield* Effect.promise(() => requestToInspect.json())).toEqual({
          accept,
          oauth_query:
            "sig=signed&ba_param=client_id&ba_param=scope&client_id=client-1&scope=openid+profile",
          scope: "openid profile",
        });
      }
    }),
  );
});
