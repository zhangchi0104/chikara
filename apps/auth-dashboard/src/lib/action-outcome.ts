import { safeLocalPath } from "./navigation.js";

export type TwoFactorMethod = "passkey" | "totp";

interface TwoFactorRedirect {
  readonly twoFactorMethods?: unknown;
  readonly twoFactorRedirect: true;
}

export function isTwoFactorRedirect(
  value: unknown,
): value is TwoFactorRedirect {
  return (
    value !== null &&
    typeof value === "object" &&
    "twoFactorRedirect" in value &&
    value.twoFactorRedirect === true
  );
}

export function twoFactorMethods(
  value: unknown,
): ReadonlyArray<TwoFactorMethod> {
  if (
    !isTwoFactorRedirect(value) ||
    !("twoFactorMethods" in value) ||
    !Array.isArray(value.twoFactorMethods)
  ) {
    return [];
  }
  return value.twoFactorMethods.filter(
    (method): method is TwoFactorMethod =>
      method === "passkey" || method === "totp",
  );
}

export function twoFactorLocation(value: unknown, destination: string): string {
  const query = new URLSearchParams({ returnTo: destination });
  for (const method of twoFactorMethods(value)) query.append("method", method);
  return `/two-factor?${query.toString()}`;
}

export function enhancedActionLocation(
  value: unknown,
  requestedLocation: unknown,
  currentPathname: string,
): string {
  const destination = safeLocalPath(requestedLocation, currentPathname);
  if (!isTwoFactorRedirect(value)) return destination;
  return twoFactorLocation(value, destination);
}
