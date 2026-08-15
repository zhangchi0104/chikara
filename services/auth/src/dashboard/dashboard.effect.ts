import { APIError } from "better-auth";
import { Effect } from "effect";
import { DashboardError, DashboardStorageError } from "./dashboard.error.js";

export function storageEffect<A>(operation: string, task: () => Promise<A>) {
  return Effect.tryPromise({
    catch: (cause) =>
      cause instanceof DashboardError || cause instanceof DashboardStorageError
        ? cause
        : new DashboardStorageError(operation, { cause }),
    try: task,
  });
}

export function constrainedStorageEffect<A>(
  operation: string,
  conflictMessage: string,
  task: () => Promise<A>,
) {
  return Effect.tryPromise({
    catch: (cause) => {
      if (
        cause instanceof DashboardError ||
        cause instanceof DashboardStorageError
      ) {
        return cause;
      }
      if (
        cause instanceof Error &&
        /constraint|unique|foreign key/i.test(cause.message)
      ) {
        return new DashboardError(409, conflictMessage);
      }
      return new DashboardStorageError(operation, { cause });
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
    catch: (cause) => {
      if (cause instanceof APIError && cause.statusCode < 500) {
        const status = cause.statusCode === 404 ? 404 : errorStatus;
        return new DashboardError(status, errorMessage);
      }
      return new DashboardStorageError(operation, { cause });
    },
    try: task,
  });
}
