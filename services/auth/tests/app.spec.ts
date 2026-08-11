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
      expect(yield* Effect.promise(() => signIn.text())).toMatch(
        /Sign in to Chikara/,
      );
      expect(yield* Effect.promise(() => consent.text())).toMatch(
        /Authorize this client/,
      );
    }),
  );
});
