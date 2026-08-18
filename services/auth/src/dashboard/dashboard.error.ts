import { Schema } from "effect";

const DashboardErrorStatus = Schema.Literals([400, 401, 403, 404, 409, 422]);

export type DashboardErrorStatus = typeof DashboardErrorStatus.Type;

export class DashboardError extends Schema.TaggedErrorClass<DashboardError>()(
  "DashboardError",
  {
    message: Schema.String,
    status: DashboardErrorStatus,
  },
) {}

export class DashboardStorageError extends Schema.TaggedErrorClass<DashboardStorageError>()(
  "DashboardStorageError",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    operation: Schema.String,
  },
) {}

export function dashboardStorageError(operation: string, cause?: unknown) {
  return new DashboardStorageError({
    ...(cause === undefined ? {} : { cause }),
    message: `Dashboard storage failed during ${operation}.`,
    operation,
  });
}
