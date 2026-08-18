import { Clock, Context, Effect, Schema } from "effect";
import { dashboardAuthFailure } from "./dashboard/dashboard.effect.js";
import { DashboardError } from "./dashboard/dashboard.error.js";
import type {
  ApplicationType,
  CreateApplicationResult,
  DashboardApplication,
} from "./dashboard/dashboard.models.js";
import {
  type ApiRecordInput,
  type ManagedApplication,
  ProtectedResourceStore,
} from "./protected-resource.store.js";

export interface ApplicationRegistration {
  readonly clientId: string;
  readonly issuedAt?: number;
  readonly referenceId: string;
  readonly secret?: string;
}

const ApplicationProviderOperationSchema = Schema.Literals([
  "create",
  "remove",
  "rotate",
  "update",
]);

export type ApplicationProviderOperation =
  typeof ApplicationProviderOperationSchema.Type;

export class ApplicationProviderError extends Schema.TaggedErrorClass<ApplicationProviderError>()(
  "ApplicationProviderError",
  {
    operation: ApplicationProviderOperationSchema,
    providerCause: Schema.Defect(),
  },
) {}

export interface ApplicationRegistrationInput {
  readonly name: string;
  readonly redirectUris: ReadonlyArray<string>;
  readonly type: ApplicationType;
}

type ApplicationProviderEffect<A> = Effect.Effect<A, ApplicationProviderError>;

export interface ApplicationProviderService {
  create(
    headers: Headers,
    input: ApplicationRegistrationInput,
  ): ApplicationProviderEffect<ApplicationRegistration>;
  remove(
    headers: Headers,
    referenceId: string,
    clientId: string,
  ): ApplicationProviderEffect<void>;
  rotate(
    headers: Headers,
    referenceId: string,
    clientId: string,
  ): ApplicationProviderEffect<string | undefined>;
  update(
    headers: Headers,
    referenceId: string,
    clientId: string,
    input: Pick<ApplicationRegistrationInput, "name" | "redirectUris">,
  ): ApplicationProviderEffect<void>;
}

export class ApplicationProvider extends Context.Service<
  ApplicationProvider,
  ApplicationProviderService
>()("@chikara/auth/ApplicationProvider") {}

export type ProtectedResourceServices =
  | ApplicationProvider
  | ProtectedResourceStore;

export interface CreateApplicationInput {
  readonly apiId: string;
  readonly name: string;
  readonly redirectUris: ReadonlyArray<string>;
  readonly type: ApplicationType;
}

export interface UpdateApplicationInput {
  readonly apiId: string;
  readonly disabled: boolean;
  readonly name: string;
  readonly redirectUris: ReadonlyArray<string>;
}

function applicationResult(
  input: CreateApplicationInput,
  apiName: string,
  client: ApplicationRegistration,
  currentTimeMillis: number,
): DashboardApplication {
  const now =
    (client.issuedAt ?? Math.floor(currentTimeMillis / 1_000)) * 1_000;
  return {
    apiId: input.apiId,
    apiName,
    clientId: client.clientId,
    createdAt: now,
    disabled: false,
    name: input.name,
    redirectUris: input.redirectUris,
    type: input.type,
    updatedAt: now,
  };
}

function updateProvider(
  provider: ApplicationProviderService,
  headers: Headers,
  application: ManagedApplication,
  input: Pick<UpdateApplicationInput, "name" | "redirectUris">,
) {
  return providerCall(
    "update Application",
    422,
    "The Application configuration is invalid.",
    provider.update(headers, application.referenceId, application.clientId, {
      name: input.name,
      redirectUris: input.redirectUris,
    }),
  );
}

function providerCall<A>(
  operation: string,
  errorStatus: 404 | 409 | 422,
  errorMessage: string,
  effect: ApplicationProviderEffect<A>,
) {
  return effect.pipe(
    Effect.mapError((error) =>
      dashboardAuthFailure(
        operation,
        errorStatus,
        errorMessage,
        error.providerCause,
      ),
    ),
  );
}

export const protectedResourceAuthorization = {
  listApis: ProtectedResourceStore.use((store) => store.listApis),
  createApi: (input: ApiRecordInput) =>
    ProtectedResourceStore.use((store) => store.createApi(input)),
  updateApi: (apiId: string, input: ApiRecordInput) =>
    ProtectedResourceStore.use((store) => store.updateApi(apiId, input)),
  removeApi: (apiId: string) =>
    ProtectedResourceStore.use((store) => store.removeApi(apiId)),
  listApplications: ProtectedResourceStore.use(
    (store) => store.listApplications,
  ),
  createApplication(headers: Headers, input: CreateApplicationInput) {
    return Effect.gen(function* () {
      const store = yield* ProtectedResourceStore;
      const provider = yield* ApplicationProvider;
      const api = yield* store.requireApi(input.apiId);
      const client = yield* providerCall(
        "create Application",
        422,
        "The Application configuration is invalid.",
        provider.create(headers, {
          name: input.name,
          redirectUris: input.redirectUris,
          type: input.type,
        }),
      );
      const secret = client.secret;
      if (input.type === "web" && !secret) {
        yield* providerCall(
          "compensate incomplete Application creation",
          409,
          "The provider did not issue a credential.",
          provider.remove(headers, client.referenceId, client.clientId),
        );
        return yield* new DashboardError({
          message: "The provider did not issue a credential.",
          status: 409,
        });
      }

      yield* store
        .assignApplication(client.clientId, input.apiId)
        .pipe(
          Effect.tapError(() =>
            providerCall(
              "compensate Application creation",
              409,
              "The Application could not be linked to its API.",
              provider.remove(headers, client.referenceId, client.clientId),
            ),
          ),
        );

      const currentTimeMillis = yield* Clock.currentTimeMillis;
      const application = applicationResult(
        input,
        api.name,
        client,
        currentTimeMillis,
      );
      if (input.type === "native") {
        return {
          application: { ...application, type: "native" },
        } satisfies CreateApplicationResult;
      }
      if (!secret) {
        return yield* new DashboardError({
          message: "The provider did not issue a credential.",
          status: 409,
        });
      }
      return {
        application: { ...application, type: "web" },
        credential: secret,
      } satisfies CreateApplicationResult;
    });
  },

  updateApplication(
    headers: Headers,
    clientId: string,
    input: UpdateApplicationInput,
  ) {
    return Effect.gen(function* () {
      const store = yield* ProtectedResourceStore;
      const provider = yield* ApplicationProvider;
      const application = yield* store.requireApplication(clientId);
      yield* store.requireApi(input.apiId);
      yield* updateProvider(provider, headers, application, input);
      yield* store
        .updateApplicationRecord(
          clientId,
          application.referenceId,
          input.apiId,
          input.disabled,
        )
        .pipe(
          Effect.tapError(() =>
            updateProvider(provider, headers, application, {
              name: application.name,
              redirectUris: application.redirectUris,
            }),
          ),
        );
    });
  },

  rotateApplication(headers: Headers, clientId: string) {
    return Effect.gen(function* () {
      const store = yield* ProtectedResourceStore;
      const provider = yield* ApplicationProvider;
      const application = yield* store.requireApplication(clientId);
      if (application.publicClient) {
        return yield* new DashboardError({
          message: "Native applications do not use a client credential.",
          status: 409,
        });
      }
      if (application.disabled) {
        return yield* new DashboardError({
          message: "Enable the Application before rotating it.",
          status: 409,
        });
      }
      const secret = yield* providerCall(
        "rotate Application credential",
        404,
        "Application not found.",
        provider.rotate(headers, application.referenceId, clientId),
      );
      if (!secret) {
        return yield* new DashboardError({
          message: "The provider did not issue a credential.",
          status: 409,
        });
      }
      return secret;
    });
  },

  removeApplication(headers: Headers, clientId: string) {
    return Effect.gen(function* () {
      const store = yield* ProtectedResourceStore;
      const provider = yield* ApplicationProvider;
      const application = yield* store.requireApplication(clientId);
      yield* providerCall(
        "remove Application",
        404,
        "Application not found.",
        provider.remove(headers, application.referenceId, clientId),
      );
    });
  },
};

function clientIdFromBasicAuthorization(header: string | null): string | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return decodeURIComponent(decoded.slice(0, separator));
  } catch {
    return null;
  }
}

function tokenError(description: string): Response {
  return Response.json(
    { error: "invalid_target", error_description: description },
    { headers: { "Cache-Control": "no-store" }, status: 400 },
  );
}

export function authorizeTokenRequest(request: Request) {
  return Effect.gen(function* () {
    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.endsWith("/oauth2/token")) {
      return undefined;
    }
    const body = yield* Effect.tryPromise({
      catch: () => undefined,
      try: () => request.clone().formData(),
    }).pipe(Effect.orElseSucceed(() => undefined));
    const resource = body?.get("resource");
    if (typeof resource !== "string" || resource.length === 0) {
      return tokenError("A resource identifying the target API is required.");
    }
    const bodyClientId = body?.get("client_id");
    const clientId =
      typeof bodyClientId === "string" && bodyClientId.length > 0
        ? bodyClientId
        : clientIdFromBasicAuthorization(request.headers.get("authorization"));
    if (!clientId) return tokenError("A client_id is required.");

    const store = yield* ProtectedResourceStore;
    const assigned = yield* store.hasAssignment(clientId, resource);
    return assigned
      ? undefined
      : tokenError("This Application is not assigned to the requested API.");
  });
}
