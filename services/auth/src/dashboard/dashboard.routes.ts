import { Effect } from "effect";
import { Hono } from "hono";
import type { AuthBindings } from "../configs/auth.config.js";
import {
  createApi,
  listApis,
  removeApi,
  updateApi,
} from "./dashboard.api-store.js";
import {
  createApplication,
  listApplications,
  removeApplication,
  rotateApplicationCredential,
  updateApplication,
} from "./dashboard.application-store.js";
import {
  bootstrapSuperuser,
  getAccountSession,
  isBootstrapped,
  requireSuperuser,
} from "./dashboard.auth.js";
import { DashboardError, DashboardStorageError } from "./dashboard.error.js";
import {
  applicationType,
  optionalString,
  readJson,
  requiredEmail,
  requiredString,
  requiredUrl,
  urlList,
} from "./dashboard.input.js";
import {
  createUser,
  getUserDetail,
  listUsers,
  removeUser,
  revokeUserSessions,
  updateUser,
} from "./dashboard.user-store.js";

function activityCursor(request: Request) {
  const url = new URL(request.url);
  const occurredAtValue = url.searchParams.get("before");
  const id = url.searchParams.get("beforeId");
  if (occurredAtValue === null && id === null) return undefined;
  const occurredAt = Number(occurredAtValue);
  if (
    occurredAtValue === null ||
    id === null ||
    !id ||
    !Number.isSafeInteger(occurredAt) ||
    occurredAt < 0
  ) {
    throw new DashboardError(400, "The activity cursor is invalid.");
  }
  return { id, occurredAt };
}

function promiseEffect<A>(task: () => Promise<A>) {
  return Effect.tryPromise({
    catch: (cause) =>
      cause instanceof DashboardError || cause instanceof DashboardStorageError
        ? cause
        : new DashboardStorageError("request execution", { cause }),
    try: task,
  });
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
    Effect.runPromise(
      promiseEffect(() => isBootstrapped(context.env.AUTH_DB)),
    ).then((bootstrapped) => context.json({ bootstrapped })),
  );

  app.post("/bootstrap", async (context) => {
    const input = await Effect.runPromise(readJson(context.req.raw));
    const user = await Effect.runPromise(
      promiseEffect(() =>
        bootstrapSuperuser(context.env, {
          email: requiredEmail(input, "email"),
          name: requiredString(input, "name", { max: 100 }),
          password: requiredString(input, "password", { min: 12, max: 128 }),
          token: requiredString(input, "token", { min: 20, max: 256 }),
        }),
      ),
    );
    return context.json({ user }, 201);
  });

  app.get("/session", async (context) => {
    const account = await Effect.runPromise(
      promiseEffect(() => getAccountSession(context.req.raw, context.env)),
    );
    return context.json(account);
  });

  app.use("/*", async (context, next) => {
    const user = await Effect.runPromise(
      promiseEffect(() => requireSuperuser(context.req.raw, context.env)),
    );
    context.set("superuser", user);
    await next();
  });

  app.get("/users", (context) =>
    Effect.runPromise(listUsers(context.env.AUTH_DB)).then((users) =>
      context.json({ users }),
    ),
  );
  app.get("/users/:id", (context) =>
    Effect.runPromise(
      getUserDetail(
        context.env.AUTH_DB,
        context.req.param("id"),
        activityCursor(context.req.raw),
      ),
    ).then((detail) => {
      context.header("cache-control", "no-store");
      return context.json(detail);
    }),
  );
  app.post("/users", async (context) => {
    const input = await Effect.runPromise(readJson(context.req.raw));
    const user = await Effect.runPromise(
      createUser(context.env, context.req.raw.headers, {
        email: requiredEmail(input, "email"),
        name: requiredString(input, "name", { max: 100 }),
        password: requiredString(input, "password", { min: 12, max: 128 }),
      }),
    );
    return context.json({ user }, 201);
  });
  app.patch("/users/:id", async (context) => {
    const input = await Effect.runPromise(readJson(context.req.raw));
    await Effect.runPromise(
      updateUser(
        context.env,
        context.req.raw.headers,
        context.req.param("id"),
        {
          email: requiredEmail(input, "email"),
          name: requiredString(input, "name", { max: 100 }),
        },
      ),
    );
    return context.json({ ok: true });
  });
  app.delete("/users/:id", async (context) => {
    if (context.req.param("id") === context.get("superuser").id) {
      throw new DashboardError(
        409,
        "The superuser cannot delete their own account.",
      );
    }
    await Effect.runPromise(
      removeUser(context.env, context.req.raw.headers, context.req.param("id")),
    );
    return context.json({ ok: true });
  });
  app.post("/users/:id/revoke-sessions", async (context) => {
    if (context.req.param("id") === context.get("superuser").id) {
      throw new DashboardError(
        409,
        "The superuser cannot revoke their own active access here.",
      );
    }
    await Effect.runPromise(
      revokeUserSessions(
        context.env,
        context.req.raw.headers,
        context.req.param("id"),
      ),
    );
    return context.json({ ok: true });
  });

  app.get("/apis", (context) =>
    Effect.runPromise(listApis(context.env.AUTH_DB)).then((apis) =>
      context.json({ apis }),
    ),
  );
  app.post("/apis", async (context) => {
    const input = await Effect.runPromise(readJson(context.req.raw));
    const api = await Effect.runPromise(
      createApi(context.env.AUTH_DB, {
        description: optionalString(input, "description", 500) ?? "",
        identifier: requiredUrl(input, "identifier"),
        name: requiredString(input, "name", { max: 100 }),
      }),
    );
    return context.json({ api }, 201);
  });
  app.patch("/apis/:id", async (context) => {
    const input = await Effect.runPromise(readJson(context.req.raw));
    await Effect.runPromise(
      updateApi(context.env.AUTH_DB, context.req.param("id"), {
        description: optionalString(input, "description", 500) ?? "",
        identifier: requiredUrl(input, "identifier"),
        name: requiredString(input, "name", { max: 100 }),
      }),
    );
    return context.json({ ok: true });
  });
  app.delete("/apis/:id", async (context) => {
    await Effect.runPromise(
      removeApi(context.env.AUTH_DB, context.req.param("id")),
    );
    return context.json({ ok: true });
  });

  app.get("/applications", (context) =>
    Effect.runPromise(listApplications(context.env.AUTH_DB)).then(
      (applications) => context.json({ applications }),
    ),
  );
  app.post("/applications", async (context) => {
    const input = await Effect.runPromise(readJson(context.req.raw));
    const result = await Effect.runPromise(
      createApplication(context.env, context.req.raw.headers, {
        apiId: requiredString(input, "apiId"),
        name: requiredString(input, "name", { max: 100 }),
        redirectUris: urlList(input, "redirectUris"),
        type: applicationType(input),
      }),
    );
    return context.json(result, 201);
  });
  app.patch("/applications/:clientId", async (context) => {
    const input = await Effect.runPromise(readJson(context.req.raw));
    await Effect.runPromise(
      updateApplication(
        context.env,
        context.req.raw.headers,
        context.req.param("clientId"),
        {
          apiId: requiredString(input, "apiId"),
          disabled: input.disabled === true,
          name: requiredString(input, "name", { max: 100 }),
          redirectUris: urlList(input, "redirectUris"),
        },
      ),
    );
    return context.json({ ok: true });
  });
  app.post("/applications/:clientId/rotate", async (context) => {
    const credential = await Effect.runPromise(
      rotateApplicationCredential(
        context.env,
        context.req.raw.headers,
        context.req.param("clientId"),
      ),
    );
    return context.json({ credential });
  });
  app.delete("/applications/:clientId", async (context) => {
    await Effect.runPromise(
      removeApplication(
        context.env,
        context.req.raw.headers,
        context.req.param("clientId"),
      ),
    );
    return context.json({ ok: true });
  });

  return app;
}

declare module "hono" {
  interface ContextVariableMap {
    superuser: import("./dashboard.models.js").Superuser;
  }
}
