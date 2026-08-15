import { Effect } from "effect";
import { Hono } from "hono";

export interface AuthServiceBinding {
  fetch(request: Request): Response | Promise<Response>;
}

export interface GatewayBindings {
  AUTH: AuthServiceBinding;
}

const AUTH_ROUTE_PREFIX = "/auth";
const AUTH_PAGES = ["/consent", "/sign-in", "/sign-up"] as const;
const AUTH_METADATA_PATH = "/.well-known/oauth-authorization-server/api/auth";

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

function forwardAuth(
  binding: AuthServiceBinding,
  request: Request,
): Promise<Response> {
  return Effect.runPromise(invokeAuth(binding, request));
}

export function createApp(): Hono<{ Bindings: GatewayBindings }> {
  const app = new Hono<{ Bindings: GatewayBindings }>();

  app.get("/", (context) =>
    Effect.runPromise(
      Effect.succeed({ service: "gateway", status: "ok" }),
    ).then((body) => context.json(body)),
  );
  app.get("/health", (context) => context.json({ status: "ok" }));

  app.all("/api/auth/*", (context) =>
    forwardAuth(context.env.AUTH, context.req.raw),
  );
  app.get(AUTH_METADATA_PATH, (context) =>
    forwardAuth(context.env.AUTH, context.req.raw),
  );
  for (const path of AUTH_PAGES) {
    app.get(path, (context) => forwardAuth(context.env.AUTH, context.req.raw));
  }
  app.all(`${AUTH_ROUTE_PREFIX}/*`, (context) =>
    forwardAuth(context.env.AUTH, createAuthRequest(context.req.raw)),
  );

  return app;
}

export const app = createApp();
