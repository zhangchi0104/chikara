import type { AccountSession } from "./models.js";

export const MANAGEMENT_LANDING = "/apis";

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

export type ManagementPageId =
  | (typeof managementRoutes)[number]["id"]
  | "security";

const managementPages = new Set<string>([
  ...managementRoutes.map((route) => route.href),
  "/security",
]);

function canonicalPathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function authenticatedLanding(
  account: Pick<AccountSession, "canManage">,
): "/apis" | "/profile" {
  return account.canManage ? MANAGEMENT_LANDING : "/profile";
}

export function isProtectedPage(pathname: string): boolean {
  const canonical = canonicalPathname(pathname);
  return canonical === "/profile" || managementPages.has(canonical);
}

export function canAccessPage(
  pathname: string,
  account: Pick<AccountSession, "canManage">,
): boolean {
  return !managementPages.has(canonicalPathname(pathname)) || account.canManage;
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
