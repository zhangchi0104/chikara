import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createApp, type GatewayBindings } from "../src/app.js";

function authBinding(
  handler: (request: Request) => Response | Promise<Response>,
): GatewayBindings {
  return { AUTH: { fetch: handler } };
}

describe("gateway", () => {
  const app = createApp();

  it.effect("reports liveness without invoking a service", () =>
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

  it.effect("identifies the gateway", () =>
    Effect.gen(function* () {
      const response = yield* Effect.promise(() =>
        Promise.resolve(app.request("/")),
      );

      expect(yield* Effect.promise(() => response.json())).toEqual({
        service: "gateway",
        status: "ok",
      });
    }),
  );

  it.effect("invokes auth and strips its gateway route prefix", () =>
    Effect.gen(function* () {
      const binding = authBinding(async (request) =>
        Response.json({
          body: await request.text(),
          marker: request.headers.get("x-request-marker"),
          method: request.method,
          url: request.url,
        }),
      );
      const response = yield* Effect.promise(() =>
        Promise.resolve(
          app.request(
            "/auth/api/auth/oauth2/token?audience=mobile",
            {
              body: "grant_type=authorization_code",
              headers: {
                "content-type": "application/x-www-form-urlencoded",
                "x-request-marker": "gateway-test",
              },
              method: "POST",
            },
            binding,
          ),
        ),
      );

      expect(yield* Effect.promise(() => response.json())).toEqual({
        body: "grant_type=authorization_code",
        marker: "gateway-test",
        method: "POST",
        url: "http://localhost/api/auth/oauth2/token?audience=mobile",
      });
    }),
  );

  it.effect("routes auth health checks to the auth health endpoint", () =>
    Effect.gen(function* () {
      const binding = authBinding((request) =>
        Response.json({ path: new URL(request.url).pathname, status: "ok" }),
      );
      const response = yield* Effect.promise(() =>
        Promise.resolve(app.request("/auth/health", undefined, binding)),
      );

      expect(response.status).toBe(200);
      expect(yield* Effect.promise(() => response.json())).toEqual({
        path: "/health",
        status: "ok",
      });
    }),
  );

  it.effect("exposes the canonical public auth routes", () =>
    Effect.gen(function* () {
      const paths: Array<string> = [];
      const binding = authBinding((request) => {
        paths.push(new URL(request.url).pathname);
        return new Response("auth");
      });

      for (const path of [
        "/api/auth/oauth2/authorize",
        "/.well-known/oauth-authorization-server/api/auth",
        "/sign-in",
        "/sign-up",
        "/consent",
      ]) {
        const response = yield* Effect.promise(() =>
          Promise.resolve(app.request(path, undefined, binding)),
        );
        expect(response.status).toBe(200);
      }

      expect(paths).toEqual([
        "/api/auth/oauth2/authorize",
        "/.well-known/oauth-authorization-server/api/auth",
        "/sign-in",
        "/sign-up",
        "/consent",
      ]);
    }),
  );

  it.effect("returns the auth response unchanged", () =>
    Effect.gen(function* () {
      const binding = authBinding(() =>
        Promise.resolve(
          new Response("created by auth", {
            headers: { "x-auth-response": "preserved" },
            status: 201,
          }),
        ),
      );
      const response = yield* Effect.promise(() =>
        Promise.resolve(app.request("/auth/session", undefined, binding)),
      );

      expect(response.status).toBe(201);
      expect(response.headers.get("x-auth-response")).toBe("preserved");
      expect(yield* Effect.promise(() => response.text())).toBe(
        "created by auth",
      );
    }),
  );

  it.effect("does not invoke auth outside its route", () =>
    Effect.gen(function* () {
      let invoked = false;
      const binding = authBinding(() => {
        invoked = true;
        return new Response();
      });
      const response = yield* Effect.promise(() =>
        Promise.resolve(app.request("/users/me", undefined, binding)),
      );

      expect(response.status).toBe(404);
      expect(invoked).toBe(false);
    }),
  );
});
