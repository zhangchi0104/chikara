import { safeLocalPath } from "./navigation.js";

export function isTwoFactorRedirect(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    "twoFactorRedirect" in value &&
    value.twoFactorRedirect === true
  );
}

export function enhancedActionLocation(
  value: unknown,
  requestedLocation: unknown,
  currentPathname: string,
): string {
  const destination = safeLocalPath(requestedLocation, currentPathname);
  if (!isTwoFactorRedirect(value)) return destination;
  const query = new URLSearchParams({ returnTo: destination });
  return `/two-factor?${query.toString()}`;
}
