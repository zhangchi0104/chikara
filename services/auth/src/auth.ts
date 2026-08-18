import { betterAuth } from "better-auth";
import { Context, Effect, Layer } from "effect";
import type { AccountProtectionAuthAdapter } from "./account-protection.js";
import { createAuthAuditPlugin } from "./auth-audit/auth-audit.plugin.js";
import { runtimePromise } from "./auth-runtime.effect.js";
import { type AuthBindings, readAuthConfig } from "./configs/auth.config.js";
import { createAuthOptions } from "./constants/better-auth.constant.js";
import { isSuperuserId } from "./dashboard/dashboard.superuser.js";
import {
  ProtectedResourceStore,
  type ProtectedResourceStoreService,
  protectedResourceStoreLayer,
} from "./protected-resource.store.js";

export interface CreateAuthOptions {
  readonly clientReference?: string;
}

function makeAuthFactory(
  bindings: AuthBindings,
  store: ProtectedResourceStoreService,
) {
  const isSuperuser = (userId: string) =>
    Effect.runPromise(isSuperuserId(bindings.AUTH_DB, userId));

  const make = Effect.fn("AuthFactory.make")(function* (
    options: CreateAuthOptions = {},
  ) {
    const validAudiences = yield* store.listAudiences;
    const config = yield* readAuthConfig(bindings);
    const configured = createAuthOptions(config, {
      isSuperuser,
      validAudiences,
      ...(options.clientReference
        ? { clientReference: options.clientReference }
        : {}),
    });
    return betterAuth({
      ...configured,
      database: bindings.AUTH_DB,
      plugins: [...configured.plugins, createAuthAuditPlugin(bindings.AUTH_DB)],
    });
  });

  return { make };
}

export type AuthFactoryService = ReturnType<typeof makeAuthFactory>;

export class AuthFactory extends Context.Service<
  AuthFactory,
  AuthFactoryService
>()("@chikara/auth/AuthFactory") {}

export function authFactoryLayer(bindings: AuthBindings) {
  return Layer.effect(
    AuthFactory,
    Effect.gen(function* () {
      const store = yield* ProtectedResourceStore;
      return makeAuthFactory(bindings, store);
    }),
  );
}

export function authRuntimeLayer(bindings: AuthBindings) {
  return authFactoryLayer(bindings).pipe(
    Layer.provideMerge(protectedResourceStoreLayer(bindings.AUTH_DB)),
  );
}

export function createAuth(options: CreateAuthOptions = {}) {
  return AuthFactory.use((factory) => factory.make(options));
}

export const accountProtectionAuthAdapter = createAuth().pipe(
  Effect.map(
    (auth): AccountProtectionAuthAdapter => ({
      forward: (request) =>
        runtimePromise("forward Better Auth request", () =>
          auth.handler(request),
        ),
      sessionUserId: (request) =>
        runtimePromise("read Better Auth session", () =>
          auth.api.getSession({
            headers: request.headers,
            query: { disableCookieCache: true, disableRefresh: true },
          }),
        ).pipe(Effect.map((session) => session?.user.id)),
    }),
  ),
);
