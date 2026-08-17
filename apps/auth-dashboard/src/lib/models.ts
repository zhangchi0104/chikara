export type {
  AccountProfile,
  AccountSession,
  DashboardApi as Api,
  DashboardApplication as Application,
  DashboardUser as User,
  Superuser,
  TwoFactorState,
} from "@chikara/auth/dashboard-contract";

export interface OauthEndpoints {
  readonly authorizationUrl: string;
  readonly tokenUrl: string;
}

export function formatDate(value: number | string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
