export type DashboardErrorStatus = 400 | 401 | 403 | 404 | 409 | 422;

export class DashboardError extends Error {
  readonly status: DashboardErrorStatus;

  constructor(status: DashboardErrorStatus, message: string) {
    super(message);
    this.name = "DashboardError";
    this.status = status;
  }
}

export class DashboardStorageError extends Error {
  constructor(
    readonly operation: string,
    options?: ErrorOptions,
  ) {
    super(`Dashboard storage failed during ${operation}.`, options);
    this.name = "DashboardStorageError";
  }
}
