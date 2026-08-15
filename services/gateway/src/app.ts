import { Effect } from "effect";
import { Hono } from "hono";

export interface AuthServiceBinding {
  fetch(request: Request): Response | Promise<Response>;
}

export interface GatewayBindings {
  AUTH: AuthServiceBinding;
}

const AUTH_ROUTE_PREFIX = "/auth";

function createAuthRequest(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = url.pathname.slice(AUTH_ROUTE_PREFIX.length) || "/";
  return new Request(url, request);
}

const invokeAuth = Effect.fnUntraced(function* (
  binding: AuthServiceBinding,
  request: Request,
) {
  return yield* Effect.tryPromise(() =>
    Promise.resolve(binding.fetch(request)),
  );
});

export function createApp(): Hono<{ Bindings: GatewayBindings }> {
  const app = new Hono<{ Bindings: GatewayBindings }>();

  app.get("/", (context) =>
    Effect.runPromise(
      Effect.succeed({ service: "gateway", status: "ok" }),
    ).then((body) => context.json(body)),
  );
  app.get("/health", (context) => context.json({ status: "ok" }));

  app.all(`${AUTH_ROUTE_PREFIX}/*`, (context) =>
    Effect.runPromise(
      invokeAuth(context.env.AUTH, createAuthRequest(context.req.raw)),
    ),
  );

  return app;
}

export const app = createApp();
