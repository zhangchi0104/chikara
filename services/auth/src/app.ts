import { Effect } from "effect";
import { Hono } from "hono";
import { handleAccountProtectionRequest } from "./account-protection.js";
import { accountProtectionAuthAdapter, authRuntimeLayer } from "./auth.js";
import { runtimePromise } from "./auth-runtime.effect.js";
import type { AuthBindings } from "./configs/auth.config.js";
import { AUTH_BASE_PATH } from "./constants/better-auth.constant.js";
import { createDashboardApp } from "./dashboard/dashboard.routes.js";
import { consentPage, signInPage, signUpPage, twoFactorPage } from "./pages.js";
import { authorizeTokenRequest } from "./protected-resource-authorization.js";
import {
  challengeMethods,
  handleSignInPageAction,
  handleTwoFactorPageAction,
  redirectWithCookies,
  signedOAuthQuery,
} from "./public-page-action.js";

type AuthHandler = (
  request: Request,
  bindings: AuthBindings,
) => Effect.Effect<Response, Error>;

const defaultAuthHandler: AuthHandler = (request, bindings) =>
  Effect.gen(function* () {
    const audienceError = yield* authorizeTokenRequest(request);
    if (audienceError) return audienceError;
    const authAdapter = yield* accountProtectionAuthAdapter;
    return yield* handleAccountProtectionRequest(request, {
      database: bindings.AUTH_DB,
      openAuth: Effect.succeed(authAdapter),
      serialize: (userId, coordinatedRequest) =>
        runtimePromise("serialize account protection request", () =>
          bindings.TWO_FACTOR_COORDINATOR.getByName(userId).fetch(
            coordinatedRequest,
          ),
        ),
    });
  }).pipe(Effect.provide(authRuntimeLayer(bindings)));

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
    Effect.runPromise(authHandler(request, bindings));

  app.get("/", (context) =>
    context.json({
      issuer: AUTH_BASE_PATH,
      protocol: "OAuth 2.1",
      service: "auth",
      status: "ok",
    }),
  );
  app.get("/health", (context) => context.json({ status: "ok" }));

  app.get("/sign-in", (context) => context.html(signInPage()));
  app.post("/sign-in", (context) =>
    Effect.runPromise(
      handleSignInPageAction({
        forward: (request) => authHandler(request, context.env),
        request: context.req.raw,
      }),
    ),
  );
  app.get("/sign-up", (context) => context.html(signUpPage()));
  app.get("/two-factor", (context) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const methodsUrl = new URL(
          `${AUTH_BASE_PATH}/two-factor/methods`,
          context.req.url,
        );
        const response = yield* authHandler(
          new Request(methodsUrl, { headers: context.req.raw.headers }),
          context.env,
        );
        const payload = yield* Effect.tryPromise({
          catch: () => undefined,
          try: () => response.clone().json(),
        }).pipe(Effect.orElseSucceed(() => undefined));
        const methods = challengeMethods(payload);
        if (!response.ok || methods.length === 0) {
          const signIn = new URL("/sign-in", context.req.url);
          signIn.search = new URL(context.req.url).search;
          return context.redirect(signIn.toString(), 303);
        }
        return context.html(twoFactorPage(methods));
      }),
    ),
  );
  app.post("/two-factor", (context) =>
    Effect.runPromise(
      handleTwoFactorPageAction({
        forward: (request) => authHandler(request, context.env),
        request: context.req.raw,
      }),
    ),
  );
  app.get("/consent", (context) => context.html(consentPage()));
  app.post("/consent", (context) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const form = yield* runtimePromise("read consent form", () =>
          context.req.parseBody(),
        );
        if (form.accept !== "true" && form.accept !== "false") {
          return context.json(
            { message: "A consent decision is required" },
            400,
          );
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
        const response = yield* authHandler(
          new Request(providerUrl, {
            body: JSON.stringify(body),
            headers,
            method: "POST",
          }),
          context.env,
        );
        if (!response.ok) return response;

        const payload = yield* runtimePromise("read consent response", () =>
          response.json(),
        );
        const location = redirectUrl(payload);
        if (!location) {
          return context.json(
            {
              message: "The authorization response did not include a callback",
            },
            502,
          );
        }
        return redirectWithCookies(response, location);
      }),
    ),
  );

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
