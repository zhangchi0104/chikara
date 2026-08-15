import { Effect } from "effect";
import { DashboardError } from "./dashboard.error.js";
import type { ApplicationType } from "./dashboard.models.js";

export type JsonObject = Record<
  string,
  object | string | number | boolean | null
>;

export function readJson(request: Request) {
  return Effect.tryPromise({
    catch: () =>
      new DashboardError(400, "The request body must be valid JSON."),
    try: () => request.json(),
  }).pipe(
    Effect.flatMap((value) =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? Effect.succeed(value as JsonObject)
        : Effect.fail(
            new DashboardError(400, "The request body must be a JSON object."),
          ),
    ),
  );
}

export function applicationType(
  input: JsonObject,
  key = "type",
): ApplicationType {
  const value = optionalString(input, key, 20) ?? "web";
  if (value === "native" || value === "web") return value;
  throw new DashboardError(422, `${key} must be web or native.`);
}

export function requiredString(
  input: JsonObject,
  key: string,
  options: { readonly max?: number; readonly min?: number } = {},
): string {
  const value = input[key];
  if (typeof value !== "string") {
    throw new DashboardError(422, `${key} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < (options.min ?? 1)) {
    throw new DashboardError(422, `${key} is too short.`);
  }
  if (trimmed.length > (options.max ?? 200)) {
    throw new DashboardError(422, `${key} is too long.`);
  }
  return trimmed;
}

export function optionalString(
  input: JsonObject,
  key: string,
  max = 500,
): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new DashboardError(422, `${key} is invalid.`);
  }
  return value.trim();
}

export function requiredEmail(input: JsonObject, key: string): string {
  const value = requiredString(input, key, { max: 320 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new DashboardError(422, `${key} must be a valid email address.`);
  }
  return value;
}

export function stringList(
  input: JsonObject,
  key: string,
): ReadonlyArray<string> {
  const value = input[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new DashboardError(422, `${key} must contain at least one value.`);
  }
  const values = value.map((entry) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new DashboardError(422, `${key} contains an invalid value.`);
    }
    return entry.trim();
  });
  return [...new Set(values)];
}

export function requiredUrl(input: JsonObject, key: string): string {
  const value = requiredString(input, key);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error();
    return url.toString();
  } catch {
    throw new DashboardError(422, `${key} must be an HTTP(S) URL.`);
  }
}

export function urlList(input: JsonObject, key: string): ReadonlyArray<string> {
  return stringList(input, key).map((value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:")
        throw new Error();
      return url.toString();
    } catch {
      throw new DashboardError(422, `${key} contains an invalid HTTP(S) URL.`);
    }
  });
}
