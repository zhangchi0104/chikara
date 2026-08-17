import type { AccountSession } from "./models.js";

export const MANAGEMENT_LANDING = "/apis";

export const accountRoutes = [
  { href: "/profile", icon: "user", id: "profile", label: "Profile" },
  { href: "/security", icon: "key", id: "security", label: "Security" },
] as const;

export const managementRoutes = [
  { href: MANAGEMENT_LANDING, icon: "api", id: "apis", label: "APIs" },
  {
    href: "/applications",
    icon: "application",
    id: "applications",
    label: "Applications",
  },
  { href: "/users", icon: "user", id: "users", label: "Users" },
] as const;

export type AccountPageId = (typeof accountRoutes)[number]["id"];
export type ManagementPageId = (typeof managementRoutes)[number]["id"];

const accountPages = new Set<string>(accountRoutes.map((route) => route.href));

function canonicalPathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function isManagementPage(pathname: string): boolean {
  return managementRoutes.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

export function authenticatedLanding(
  account: Pick<AccountSession, "canManage">,
): "/apis" | "/profile" {
  return account.canManage ? MANAGEMENT_LANDING : "/profile";
}

export function isProtectedPage(pathname: string): boolean {
  const canonical = canonicalPathname(pathname);
  return accountPages.has(canonical) || isManagementPage(canonical);
}

export function canAccessPage(
  pathname: string,
  account: Pick<AccountSession, "canManage">,
): boolean {
  return !isManagementPage(canonicalPathname(pathname)) || account.canManage;
}

export function safeLocalPath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  const base = "https://dashboard.invalid";
  try {
    const url = new URL(value, base);
    return url.origin === base
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
