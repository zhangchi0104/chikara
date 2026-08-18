import { Effect } from "effect";
import { Hono } from "hono";
import type { AuthFactory } from "../auth.js";
import type { AuthBindings } from "../configs/auth.config.js";
import { protectedResourceLayer } from "../protected-resource.provider.js";
import {
  type ProtectedResourceServices,
  protectedResourceAuthorization,
} from "../protected-resource-authorization.js";
import {
  bootstrapSuperuser,
  getAccountSession,
  isBootstrapped,
  requireSuperuser,
} from "./dashboard.auth.js";
import { DashboardError } from "./dashboard.error.js";
import {
  decodeActivityCursor,
  decodeApiInput,
  decodeBootstrapInput,
  decodeCreateApplicationInput,
  decodeCreateUserInput,
  decodeUpdateApplicationInput,
  decodeUpdateUserInput,
} from "./dashboard.input.js";
import {
  createUser,
  getUserDetail,
  listUsers,
  removeUser,
  revokeUserSessions,
  updateUser,
} from "./dashboard.user-store.js";

function runDashboard<A, E>(
  bindings: AuthBindings,
  operation: Effect.Effect<A, E, AuthFactory | ProtectedResourceServices>,
) {
  return Effect.runPromise(
    operation.pipe(Effect.provide(protectedResourceLayer(bindings))),
  );
}

export function createDashboardApp(): Hono<{ Bindings: AuthBindings }> {
  const app = new Hono<{ Bindings: AuthBindings }>();

  app.onError((error, context) => {
    if (error instanceof DashboardError) {
      return context.json({ error: error.message }, error.status);
    }
    console.error(
      "Dashboard request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return context.json(
      { error: "The management request could not be completed." },
      500,
    );
  });

  app.get("/status", (context) =>
    runDashboard(
      context.env,
      isBootstrapped(context.env.AUTH_DB).pipe(
        Effect.map((bootstrapped) => context.json({ bootstrapped })),
      ),
    ),
  );

  app.post("/bootstrap", (context) =>
    runDashboard(
      context.env,
      Effect.gen(function* () {
        const input = yield* decodeBootstrapInput(context.req.raw);
        const user = yield* bootstrapSuperuser(context.env, input);
        return context.json({ user }, 201);
      }),
    ),
  );

  app.get("/session", (context) =>
    runDashboard(
      context.env,
      getAccountSession(context.req.raw, context.env).pipe(
        Effect.map((account) => context.json(account)),
      ),
    ),
  );

  app.use("/*", (context, next) =>
    runDashboard(
      context.env,
      Effect.gen(function* () {
        const user = yield* requireSuperuser(context.req.raw, context.env);
        context.set("superuser", user);
        yield* Effect.promise(next);
      }),
    ),
  );

  app.get("/users", (context) =>
    runDashboard(
      context.env,
      listUsers(context.env.AUTH_DB).pipe(
        Effect.map((users) => context.json({ users })),
      ),
    ),
  );

  app.get("/users/:id", (context) =>
    runDashboard(
      context.env,
      Effect.gen(function* () {
        const cursor = yield* decodeActivityCursor(context.req.raw);
        const detail = yield* getUserDetail(
          context.env.AUTH_DB,
          context.req.param("id"),
          cursor,
        );
        context.header("cache-control", "no-store");
        return context.json(detail);
      }),
    ),
  );

  app.post("/users", (context) =>
    runDashboard(
      context.env,
      Effect.gen(function* () {
        const input = yield* decodeCreateUserInput(context.req.raw);
        const user = yield* createUser(context.req.raw.headers, input);
        return context.json({ user }, 201);
      }),
    ),
  );

  app.patch("/users/:id", (context) =>
    runDashboard(
      context.env,
      Effect.gen(function* () {
        const input = yield* decodeUpdateUserInput(context.req.raw);
        yield* updateUser(
          context.req.raw.headers,
          context.req.param("id"),
          input,
        );
        return context.json({ ok: true });
      }),
    ),
  );

  app.delete("/users/:id", (context) =>
    runDashboard(
      context.env,
      Effect.gen(function* () {
        const userId = context.req.param("id");
        if (userId === context.get("superuser").id) {
          return yield* new DashboardError({
            message: "The superuser cannot delete their own account.",
            status: 409,
          });
        }
        yield* removeUser(context.req.raw.headers, userId);
        return context.json({ ok: true });
      }),
    ),
  );

  app.post("/users/:id/revoke-sessions", (context) =>
    runDashboard(
      context.env,
      Effect.gen(function* () {
        const userId = context.req.param("id");
        if (userId === context.get("superuser").id) {
          return yield* new DashboardError({
            message:
              "The superuser cannot revoke their own active access here.",
            status: 409,
          });
        }
        yield* revokeUserSessions(context.req.raw.headers, userId);
        return context.json({ ok: true });
      }),
    ),
  );

  app.get("/apis", (context) =>
    runDashboard(
      context.env,
      protectedResourceAuthorization.listApis.pipe(
        Effect.map((apis) => context.json({ apis })),
      ),
    ),
  );

  app.post("/apis", (context) =>
    runDashboard(
      context.env,
      Effect.gen(function* () {
        const input = yield* decodeApiInput(context.req.raw);
        const api = yield* protectedResourceAuthorization.createApi(input);
        return context.json({ api }, 201);
      }),
    ),
  );

  app.patch("/apis/:id", (context) =>
    runDashboard(
      context.env,
      Effect.gen(function* () {
        const input = yield* decodeApiInput(context.req.raw);
        yield* protectedResourceAuthorization.updateApi(
          context.req.param("id"),
          input,
        );
        return context.json({ ok: true });
      }),
    ),
  );

  app.delete("/apis/:id", (context) =>
    runDashboard(
      context.env,
      protectedResourceAuthorization
        .removeApi(context.req.param("id"))
        .pipe(Effect.map(() => context.json({ ok: true }))),
    ),
  );

  app.get("/applications", (context) =>
    runDashboard(
      context.env,
      protectedResourceAuthorization.listApplications.pipe(
        Effect.map((applications) => context.json({ applications })),
      ),
    ),
  );

  app.post("/applications", (context) =>
    runDashboard(
      context.env,
      Effect.gen(function* () {
        const input = yield* decodeCreateApplicationInput(context.req.raw);
        const result = yield* protectedResourceAuthorization.createApplication(
          context.req.raw.headers,
          input,
        );
        return context.json(result, 201);
      }),
    ),
  );

  app.patch("/applications/:clientId", (context) =>
    runDashboard(
      context.env,
      Effect.gen(function* () {
        const input = yield* decodeUpdateApplicationInput(context.req.raw);
        yield* protectedResourceAuthorization.updateApplication(
          context.req.raw.headers,
          context.req.param("clientId"),
          input,
        );
        return context.json({ ok: true });
      }),
    ),
  );

  app.post("/applications/:clientId/rotate", (context) =>
    runDashboard(
      context.env,
      protectedResourceAuthorization
        .rotateApplication(
          context.req.raw.headers,
          context.req.param("clientId"),
        )
        .pipe(Effect.map((credential) => context.json({ credential }))),
    ),
  );

  app.delete("/applications/:clientId", (context) =>
    runDashboard(
      context.env,
      protectedResourceAuthorization
        .removeApplication(
          context.req.raw.headers,
          context.req.param("clientId"),
        )
        .pipe(Effect.map(() => context.json({ ok: true }))),
    ),
  );

  return app;
}

declare module "hono" {
  interface ContextVariableMap {
    superuser: import("./dashboard.models.js").Superuser;
  }
}
