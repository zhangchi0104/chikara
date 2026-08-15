import { Effect } from "effect";
import { Hono } from "hono";
import { createAuth } from "./auth.js";
import type { AuthBindings } from "./configs/auth.config.js";
import { AUTH_BASE_PATH } from "./constants/better-auth.constant .js";
import { validateTokenAudience } from "./dashboard/dashboard.access.js";
import { createDashboardApp } from "./dashboard/dashboard.routes.js";
import { consentPage, signInPage, signUpPage } from "./pages.js";

type AuthHandler = (
  request: Request,
  bindings: AuthBindings,
) => Response | Promise<Response>;

const defaultAuthHandler: AuthHandler = async (request, bindings) => {
  const audienceError = await validateTokenAudience(request, bindings.AUTH_DB);
  if (audienceError) return audienceError;
  return (await createAuth(bindings)).handler(request);
};

const runAuthHandler = Effect.fnUntraced(function* (
  handler: AuthHandler,
  request: Request,
  bindings: AuthBindings,
) {
  return yield* Effect.tryPromise(() =>
    Promise.resolve(handler(request, bindings)),
  );
});

export function createApp(
  authHandler: AuthHandler = defaultAuthHandler,
): Hono<{ Bindings: AuthBindings }> {
  const app = new Hono<{ Bindings: AuthBindings }>();

  app.get("/", (context) =>
    Effect.runPromise(
      Effect.succeed({
        issuer: AUTH_BASE_PATH,
        protocol: "OAuth 2.1",
        service: "auth",
        status: "ok",
      }),
    ).then((body) => context.json(body)),
  );
  app.get("/health", (context) => context.json({ status: "ok" }));

  app.get("/sign-in", (context) => context.html(signInPage()));
  app.get("/sign-up", (context) => context.html(signUpPage()));
  app.get("/consent", (context) => context.html(consentPage()));

  app.route("/api/dashboard", createDashboardApp());

  const handleAuth = (request: Request, bindings: AuthBindings) =>
    Effect.runPromise(runAuthHandler(authHandler, request, bindings));

  app.on(["GET", "POST"], `${AUTH_BASE_PATH}/*`, (context) =>
    handleAuth(context.req.raw, context.env),
  );
  app.get(
    `/.well-known/oauth-authorization-server${AUTH_BASE_PATH}`,
    (context) => handleAuth(context.req.raw, context.env),
  );

  return app;
}

export const app = createApp();
