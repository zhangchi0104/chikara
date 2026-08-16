import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createApp } from "../src/app.js";

function forwardedRequestHandler(request: Request): Response {
  const url = new URL(request.url);
  return Response.json({ method: request.method, path: url.pathname });
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
      const consent = yield* Effect.promise(() =>
        Promise.resolve(app.request("/consent")),
      );

      expect(signIn.headers.get("content-type") ?? "").toMatch(/text\/html/);
      const signInHtml = yield* Effect.promise(() => signIn.text());
      expect(signInHtml).toContain("<title>Sign in · Otakuma Auth</title>");
      expect(signInHtml).toMatch(/Sign in to Otakuma Auth/);
      const consentHtml = yield* Effect.promise(() => consent.text());
      expect(consentHtml).toContain("<title>Authorize · Otakuma Auth</title>");
      expect(consentHtml).toMatch(/Authorize this client/);
      expect(consentHtml).toContain('name="accept" value="false"');
      expect(consentHtml).toContain('name="accept" value="true"');
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
          return Response.json({
            redirect: true,
            url: "chikara://oauth/callback?result=complete",
          });
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
