import type { TwoFactorState } from "../account-protection.js";
import type { AuthEventPage } from "../auth-audit/auth-audit.models.js";

export type { TwoFactorState } from "../account-protection.js";
export type {
  AuthEvent,
  AuthEventCursor,
  AuthEventPage,
  AuthEventType,
} from "../auth-audit/auth-audit.models.js";
export { authEventTypes } from "../auth-audit/auth-audit.models.js";

export interface DashboardUser {
  readonly createdAt: number | string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly id: string;
  readonly name: string;
  readonly sessionCount: number;
}

export interface DashboardUserProfile extends DashboardUser {
  readonly administrator: boolean;
  readonly image: string | null;
}

export interface DashboardUserDetail {
  readonly activity: AuthEventPage;
  readonly user: DashboardUserProfile;
}

export interface AccountProfile {
  readonly createdAt: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly id: string;
  readonly image: string | null;
  readonly name: string;
  readonly passkeyCount: number;
  readonly twoFactorState: TwoFactorState;
}

export interface AccountSession {
  readonly canManage: boolean;
  readonly user: AccountProfile;
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
