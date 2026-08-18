import { Effect, Layer } from "effect";
import {
  AuthFactory,
  type AuthFactoryService,
  authRuntimeLayer,
} from "./auth.js";
import type { AuthBindings } from "./configs/auth.config.js";
import { DASHBOARD_CLIENT_REFERENCE } from "./constants/oauth-identifiers.js";
import type {
  ApplicationProviderOperation,
  ApplicationProviderService,
} from "./protected-resource-authorization.js";
import {
  ApplicationProvider,
  ApplicationProviderError,
} from "./protected-resource-authorization.js";

function providerPromise<A>(
  operation: ApplicationProviderOperation,
  task: () => Promise<A>,
) {
  return Effect.tryPromise({
    catch: (cause) =>
      new ApplicationProviderError({ operation, providerCause: cause }),
    try: task,
  });
}

function providerAuth(
  factory: AuthFactoryService,
  operation: ApplicationProviderOperation,
  clientReference: string,
) {
  return factory
    .make({ clientReference })
    .pipe(
      Effect.mapError(
        (cause) =>
          new ApplicationProviderError({ operation, providerCause: cause }),
      ),
    );
}

function makeApplicationProvider(
  factory: AuthFactoryService,
): ApplicationProviderService {
  const create: ApplicationProviderService["create"] = Effect.fn(
    "ApplicationProvider.create",
  )(function* (headers, input) {
    const auth = yield* providerAuth(
      factory,
      "create",
      DASHBOARD_CLIENT_REFERENCE,
    );
    const client = yield* providerPromise("create", () =>
      auth.api.createOAuthClient({
        headers,
        body: {
          client_name: input.name,
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: [...input.redirectUris],
          response_types: ["code"],
          scope: "openid profile email offline_access",
          token_endpoint_auth_method:
            input.type === "native" ? "none" : "client_secret_basic",
          type: input.type,
        },
      }),
    );
    return {
      clientId: client.client_id,
      referenceId: DASHBOARD_CLIENT_REFERENCE,
      ...(client.client_id_issued_at
        ? { issuedAt: client.client_id_issued_at }
        : {}),
      ...(client.client_secret ? { secret: client.client_secret } : {}),
    };
  });

  const remove: ApplicationProviderService["remove"] = Effect.fn(
    "ApplicationProvider.remove",
  )(function* (headers, referenceId, clientId) {
    const auth = yield* providerAuth(factory, "remove", referenceId);
    yield* providerPromise("remove", () =>
      auth.api.deleteOAuthClient({
        headers,
        body: { client_id: clientId },
      }),
    );
  });

  const rotate: ApplicationProviderService["rotate"] = Effect.fn(
    "ApplicationProvider.rotate",
  )(function* (headers, referenceId, clientId) {
    const auth = yield* providerAuth(factory, "rotate", referenceId);
    const client = yield* providerPromise("rotate", () =>
      auth.api.rotateClientSecret({
        headers,
        body: { client_id: clientId },
      }),
    );
    return client.client_secret;
  });

  const update: ApplicationProviderService["update"] = Effect.fn(
    "ApplicationProvider.update",
  )(function* (headers, referenceId, clientId, input) {
    const auth = yield* providerAuth(factory, "update", referenceId);
    yield* providerPromise("update", () =>
      auth.api.updateOAuthClient({
        headers,
        body: {
          client_id: clientId,
          update: {
            client_name: input.name,
            redirect_uris: [...input.redirectUris],
          },
        },
      }),
    );
  });

  return { create, remove, rotate, update };
}

const applicationProviderLayer = Layer.effect(
  ApplicationProvider,
  Effect.gen(function* () {
    const factory = yield* AuthFactory;
    return makeApplicationProvider(factory);
  }),
);

export function protectedResourceLayer(bindings: AuthBindings) {
  return applicationProviderLayer.pipe(
    Layer.provideMerge(authRuntimeLayer(bindings)),
  );
}
