import { Effect, Schema } from "effect";
import { DashboardError } from "./dashboard.error.js";
import type { ApplicationType } from "./dashboard.models.js";

const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown);
const UnknownArraySchema = Schema.Array(Schema.Unknown);

export type JsonObject = typeof JsonObjectSchema.Type;

function dashboardError(
  status: DashboardError["status"],
  message: string,
): DashboardError {
  return new DashboardError({ message, status });
}

function decodeString(value: unknown, message: string) {
  return Schema.decodeUnknownEffect(Schema.String)(value).pipe(
    Effect.mapError(() => dashboardError(422, message)),
  );
}

export function readJson(request: Request) {
  return Effect.tryPromise({
    catch: () => dashboardError(400, "The request body must be valid JSON."),
    try: () => request.json(),
  }).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(JsonObjectSchema)(value).pipe(
        Effect.mapError(() =>
          dashboardError(400, "The request body must be a JSON object."),
        ),
      ),
    ),
  );
}

export function requiredString(
  input: JsonObject,
  key: string,
  options: { readonly max?: number; readonly min?: number } = {},
) {
  return Effect.gen(function* () {
    const value = yield* decodeString(input[key], `${key} is required.`);
    const trimmed = value.trim();
    if (trimmed.length < (options.min ?? 1)) {
      return yield* dashboardError(422, `${key} is too short.`);
    }
    if (trimmed.length > (options.max ?? 200)) {
      return yield* dashboardError(422, `${key} is too long.`);
    }
    return trimmed;
  });
}

export function optionalString(input: JsonObject, key: string, max = 500) {
  const value = input[key];
  if (value === undefined || value === null) {
    return Effect.void;
  }
  return Effect.gen(function* () {
    const decoded = yield* decodeString(value, `${key} is invalid.`);
    const trimmed = decoded.trim();
    if (trimmed.length > max) {
      return yield* dashboardError(422, `${key} is invalid.`);
    }
    return trimmed;
  });
}

export function requiredEmail(input: JsonObject, key: string) {
  return Effect.gen(function* () {
    const value = (yield* requiredString(input, key, {
      max: 320,
    })).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return yield* dashboardError(
        422,
        `${key} must be a valid email address.`,
      );
    }
    return value;
  });
}

export function stringList(input: JsonObject, key: string) {
  return Effect.gen(function* () {
    const values = yield* Schema.decodeUnknownEffect(UnknownArraySchema)(
      input[key],
    ).pipe(
      Effect.mapError(() =>
        dashboardError(422, `${key} must contain at least one value.`),
      ),
    );
    if (values.length === 0) {
      return yield* dashboardError(
        422,
        `${key} must contain at least one value.`,
      );
    }
    const decoded = yield* Effect.forEach(values, (entry) =>
      decodeString(entry, `${key} contains an invalid value.`).pipe(
        Effect.flatMap((value) => {
          const trimmed = value.trim();
          if (trimmed.length === 0) {
            return dashboardError(422, `${key} contains an invalid value.`);
          }
          return Effect.succeed(trimmed);
        }),
      ),
    );
    return [...new Set(decoded)];
  });
}

export function requiredUrl(input: JsonObject, key: string) {
  return requiredString(input, key).pipe(
    Effect.flatMap((value) =>
      Effect.try({
        catch: () => dashboardError(422, `${key} must be an HTTP(S) URL.`),
        try: () => {
          const url = new URL(value);
          if (url.protocol !== "https:" && url.protocol !== "http:") {
            throw new Error("Unsupported URL protocol");
          }
          return url.toString();
        },
      }),
    ),
  );
}

const dangerousCallbackSchemes = new Set(["data:", "javascript:", "vbscript:"]);

function isLoopbackHost(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]"
  ) {
    return true;
  }
  const octets = hostname.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  );
}

function decodeCallbackUrl(value: string, key: string) {
  return Effect.try({
    catch: () =>
      dashboardError(
        422,
        `${key} must use HTTPS, loopback HTTP, or an application URL scheme without a fragment.`,
      ),
    try: () => {
      const url = new URL(value);
      if (
        dangerousCallbackSchemes.has(url.protocol) ||
        value.includes("#") ||
        (url.protocol === "http:" && !isLoopbackHost(url.hostname))
      ) {
        throw new Error("Unsafe callback URL");
      }
      return url.toString();
    },
  });
}

export function urlList(input: JsonObject, key: string) {
  return stringList(input, key).pipe(
    Effect.flatMap((values) =>
      Effect.forEach(values, (value) => decodeCallbackUrl(value, key)),
    ),
  );
}

export function applicationType(
  input: JsonObject,
  key = "type",
): Effect.Effect<ApplicationType, DashboardError> {
  return Effect.gen(function* () {
    const value = (yield* optionalString(input, key, 20)) ?? "web";
    if (value === "native" || value === "web") return value;
    return yield* dashboardError(422, `${key} must be web or native.`);
  });
}

export const decodeBootstrapInput = Effect.fn(
  "DashboardRequest.decodeBootstrap",
)(function* (request: Request) {
  const input = yield* readJson(request);
  return {
    email: yield* requiredEmail(input, "email"),
    name: yield* requiredString(input, "name", { max: 100 }),
    password: yield* requiredString(input, "password", { min: 12, max: 128 }),
    token: yield* requiredString(input, "token", { min: 20, max: 256 }),
  };
});

export const decodeCreateUserInput = Effect.fn(
  "DashboardRequest.decodeCreateUser",
)(function* (request: Request) {
  const input = yield* readJson(request);
  return {
    email: yield* requiredEmail(input, "email"),
    name: yield* requiredString(input, "name", { max: 100 }),
    password: yield* requiredString(input, "password", { min: 12, max: 128 }),
  };
});

export const decodeUpdateUserInput = Effect.fn(
  "DashboardRequest.decodeUpdateUser",
)(function* (request: Request) {
  const input = yield* readJson(request);
  return {
    email: yield* requiredEmail(input, "email"),
    name: yield* requiredString(input, "name", { max: 100 }),
  };
});

export const decodeApiInput = Effect.fn("DashboardRequest.decodeApi")(
  function* (request: Request) {
    const input = yield* readJson(request);
    return {
      description: (yield* optionalString(input, "description", 500)) ?? "",
      identifier: yield* requiredUrl(input, "identifier"),
      name: yield* requiredString(input, "name", { max: 100 }),
    };
  },
);

export const decodeCreateApplicationInput = Effect.fn(
  "DashboardRequest.decodeCreateApplication",
)(function* (request: Request) {
  const input = yield* readJson(request);
  return {
    apiId: yield* requiredString(input, "apiId"),
    name: yield* requiredString(input, "name", { max: 100 }),
    redirectUris: yield* urlList(input, "redirectUris"),
    type: yield* applicationType(input),
  };
});

export const decodeUpdateApplicationInput = Effect.fn(
  "DashboardRequest.decodeUpdateApplication",
)(function* (request: Request) {
  const input = yield* readJson(request);
  return {
    apiId: yield* requiredString(input, "apiId"),
    disabled: input.disabled === true,
    name: yield* requiredString(input, "name", { max: 100 }),
    redirectUris: yield* urlList(input, "redirectUris"),
  };
});

export const decodeActivityCursor = Effect.fn(
  "DashboardRequest.decodeActivityCursor",
)(function* (request: Request) {
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
    return yield* dashboardError(400, "The activity cursor is invalid.");
  }
  return { id, occurredAt };
});
