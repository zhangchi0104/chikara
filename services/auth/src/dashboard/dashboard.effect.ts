import { APIError } from "better-auth";
import { Effect } from "effect";
import {
  DashboardError,
  DashboardStorageError,
  dashboardStorageError,
} from "./dashboard.error.js";

function isDashboardFailure(
  cause: unknown,
): cause is DashboardError | DashboardStorageError {
  return (
    cause instanceof DashboardError || cause instanceof DashboardStorageError
  );
}

export function storageEffect<A>(operation: string, task: () => Promise<A>) {
  return Effect.tryPromise({
    catch: (cause) =>
      isDashboardFailure(cause)
        ? cause
        : dashboardStorageError(operation, cause),
    try: task,
  });
}

export function storageOperation<A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
) {
  return effect.pipe(
    Effect.mapError((cause) =>
      isDashboardFailure(cause)
        ? cause
        : dashboardStorageError(operation, cause),
    ),
  );
}

export function constrainedStorageEffect<A>(
  operation: string,
  conflictMessage: string,
  task: () => Promise<A>,
) {
  return Effect.tryPromise({
    catch: (cause) => {
      if (isDashboardFailure(cause)) return cause;
      if (
        cause instanceof Error &&
        /constraint|unique|foreign key/i.test(cause.message)
      ) {
        return new DashboardError({ message: conflictMessage, status: 409 });
      }
      return dashboardStorageError(operation, cause);
    },
    try: task,
  });
}

export function authEffect<A>(
  operation: string,
  errorStatus: 404 | 409 | 422,
  errorMessage: string,
  task: () => Promise<A>,
) {
  return Effect.tryPromise({
    catch: (cause) =>
      dashboardAuthFailure(operation, errorStatus, errorMessage, cause),
    try: task,
  });
}

export function authOperation<A, E, R>(
  operation: string,
  errorStatus: 404 | 409 | 422,
  errorMessage: string,
  effect: Effect.Effect<A, E, R>,
) {
  return effect.pipe(
    Effect.mapError((cause) =>
      dashboardAuthFailure(operation, errorStatus, errorMessage, cause),
    ),
  );
}

export function dashboardAuthFailure(
  operation: string,
  errorStatus: 404 | 409 | 422,
  errorMessage: string,
  cause: unknown,
): DashboardError | DashboardStorageError {
  if (cause instanceof APIError && cause.statusCode < 500) {
    const status = cause.statusCode === 404 ? 404 : errorStatus;
    return new DashboardError({ message: errorMessage, status });
  }
  return dashboardStorageError(operation, cause);
}
