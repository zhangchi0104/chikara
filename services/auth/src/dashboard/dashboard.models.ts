export interface DashboardUser {
  readonly createdAt: number | string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly id: string;
  readonly name: string;
  readonly sessionCount: number;
}

export interface DashboardApi {
  readonly applicationCount: number;
  readonly createdAt: number;
  readonly description: string;
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly updatedAt: number;
}

export interface DashboardApplication {
  readonly apiId: string;
  readonly apiName: string;
  readonly clientId: string;
  readonly createdAt: number;
  readonly disabled: boolean;
  readonly name: string;
  readonly redirectUris: ReadonlyArray<string>;
  readonly type: ApplicationType;
  readonly updatedAt: number;
}

export type ApplicationType = "native" | "web";

export type CreateApplicationResult =
  | {
      readonly application: DashboardApplication & { readonly type: "native" };
    }
  | {
      readonly application: DashboardApplication & { readonly type: "web" };
      readonly credential: string;
    };

export interface Superuser {
  readonly email: string;
  readonly id: string;
  readonly name: string;
}
