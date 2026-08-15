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

function signedOAuthQuery(searchParams: URLSearchParams): string | undefined {
  const signedParameterNames = new Set(searchParams.getAll("ba_param"));
  if (!searchParams.has("sig") || signedParameterNames.size === 0) {
    return undefined;
  }

  const signedQuery = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    if (key === "sig" || key === "ba_param" || signedParameterNames.has(key)) {
      signedQuery.append(key, value);
    }
  }
  return signedQuery.toString();
}

function redirectUrl(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("url" in payload)) {
    return undefined;
  }
  return typeof payload.url === "string" ? payload.url : undefined;
}

export function createApp(
  authHandler: AuthHandler = defaultAuthHandler,
): Hono<{ Bindings: AuthBindings }> {
  const app = new Hono<{ Bindings: AuthBindings }>();
  const handleAuth = (request: Request, bindings: AuthBindings) =>
    Effect.runPromise(runAuthHandler(authHandler, request, bindings));

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
  app.post("/consent", async (context) => {
    const form = await context.req.parseBody();
    if (form.accept !== "true" && form.accept !== "false") {
      return context.json({ message: "A consent decision is required" }, 400);
    }

    const currentUrl = new URL(context.req.url);
    const headers = new Headers(context.req.raw.headers);
    headers.delete("content-length");
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");

    const oauthQuery = signedOAuthQuery(currentUrl.searchParams);
    const body: {
      accept: boolean;
      oauth_query?: string;
      scope: string;
    } = {
      accept: form.accept === "true",
      scope: currentUrl.searchParams.get("scope") ?? "",
    };
    if (oauthQuery) body.oauth_query = oauthQuery;

    const providerUrl = new URL(
      `${AUTH_BASE_PATH}/oauth2/consent`,
      context.req.url,
    );
    const response = await handleAuth(
      new Request(providerUrl, {
        body: JSON.stringify(body),
        headers,
        method: "POST",
      }),
      context.env,
    );
    if (!response.ok) return response;

    const location = redirectUrl(await response.json());
    if (!location) {
      return context.json(
        { message: "The authorization response did not include a callback" },
        502,
      );
    }
    return context.redirect(location, 303);
  });

  app.route("/api/dashboard", createDashboardApp());

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
