import type { TwoFactorState } from "./models.js";

export interface AccountProtection {
  readonly badge: "Enabled" | "Not enabled";
  readonly message: string;
  readonly tone: "ready" | "warning";
}

export function accountProtection(
  passkeyCount: number,
  authenticatorState: TwoFactorState,
): AccountProtection {
  const hasPasskey = passkeyCount > 0;
  const hasAuthenticator = authenticatorState === "enabled";
  const passkeys = passkeyCount === 1 ? "passkey" : "passkeys";
  if (hasPasskey && hasAuthenticator) {
    return {
      badge: "Enabled",
      message: `Your ${passkeys} and authenticator codes can verify password sign-ins.`,
      tone: "ready",
    };
  }
  if (hasPasskey) {
    return {
      badge: "Enabled",
      message: `Your ${passkeys} ${passkeyCount === 1 ? "protects" : "protect"} password sign-ins and can also sign you in directly when your device verifies you.`,
      tone: "ready",
    };
  }
  if (hasAuthenticator) {
    return {
      badge: "Enabled",
      message: "Authenticator codes are required after password sign-in.",
      tone: "ready",
    };
  }
  return {
    badge: "Not enabled",
    message:
      authenticatorState === "disabled"
        ? "Add a passkey or authenticator app to protect password sign-ins."
        : "Finish or reset the authenticator app setup, or add a passkey to protect password sign-ins.",
    tone: "warning",
  };
}
