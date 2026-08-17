import type { TwoFactorState } from "./models.js";

export interface TwoFactorSetup {
  readonly backupCodes: ReadonlyArray<string>;
  readonly totpURI: string;
}

export const twoFactorPresentation: Record<
  TwoFactorState,
  {
    readonly badge: string;
    readonly message: string;
    readonly tone: "ready" | "warning";
  }
> = {
  disabled: {
    badge: "Not set up",
    message: "Add an authenticator app as another verification method.",
    tone: "warning",
  },
  enabled: {
    badge: "Ready",
    message: "Authenticator codes can verify password sign-ins.",
    tone: "ready",
  },
  inconsistent: {
    badge: "Needs attention",
    message:
      "The saved authenticator state is inconsistent. Reset it before enrolling again.",
    tone: "warning",
  },
  pending: {
    badge: "Setup incomplete",
    message:
      "A setup key was generated but not verified. Restart setup or reset it.",
    tone: "warning",
  },
};

export type TwoFactorWorkflowState =
  | { readonly account: TwoFactorState; readonly kind: "account" }
  | {
      readonly kind: "enrolling";
      readonly setup: TwoFactorSetup;
      readonly verifying: boolean;
    }
  | {
      readonly codes: ReadonlyArray<string>;
      readonly kind: "recovery";
    };

export class TwoFactorWorkflow {
  #state: TwoFactorWorkflowState;

  constructor(account: TwoFactorState) {
    this.#state = { account, kind: "account" };
  }

  get current(): TwoFactorWorkflowState {
    return this.#state;
  }

  get account(): TwoFactorState {
    if (this.#state.kind === "enrolling") return "pending";
    if (this.#state.kind === "recovery") return "enabled";
    return this.#state.account;
  }

  setAccount(account: TwoFactorState): void {
    this.#state = { account, kind: "account" };
  }

  startEnrollment(setup: TwoFactorSetup): void {
    this.#state = { kind: "enrolling", setup, verifying: false };
  }

  beginVerification(): TwoFactorSetup | undefined {
    if (this.#state.kind !== "enrolling" || this.#state.verifying) {
      return undefined;
    }
    this.#state = { ...this.#state, verifying: true };
    return this.#state.setup;
  }

  verificationFailed(): void {
    if (this.#state.kind === "enrolling") {
      this.#state = { ...this.#state, verifying: false };
    }
  }

  showRecovery(codes: ReadonlyArray<string>): void {
    this.#state = { codes: [...codes], kind: "recovery" };
  }

  finishLater(): boolean {
    if (this.#state.kind !== "enrolling" || this.#state.verifying) return false;
    this.setAccount("pending");
    return true;
  }

  acknowledgeRecovery(): void {
    if (this.#state.kind === "recovery") this.setAccount("enabled");
  }
}

export function twoFactorState(value: unknown): TwoFactorState | undefined {
  return value === "disabled" ||
    value === "pending" ||
    value === "enabled" ||
    value === "inconsistent"
    ? value
    : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): ReadonlyArray<string> | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

export function setupSecret(totpURI: string): string | undefined {
  try {
    const url = new URL(totpURI);
    if (url.protocol !== "otpauth:") return undefined;
    const secret = url.searchParams.get("secret")?.trim();
    return secret || undefined;
  } catch {
    return undefined;
  }
}

export function twoFactorSetup(value: unknown): TwoFactorSetup | undefined {
  const item = record(value);
  const backupCodes = stringArray(item?.backupCodes);
  const totpURI = typeof item?.totpURI === "string" ? item.totpURI : undefined;
  return totpURI && setupSecret(totpURI) && backupCodes?.length
    ? { backupCodes, totpURI }
    : undefined;
}

export function backupCodeResult(
  value: unknown,
): ReadonlyArray<string> | undefined {
  const item = record(value);
  const backupCodes = stringArray(item?.backupCodes);
  return item?.status === true && backupCodes?.length ? backupCodes : undefined;
}

export function errorMessage(value: unknown, fallback: string): string {
  const message = record(value)?.message;
  if (typeof message !== "string" || !message.trim()) return fallback;
  return message.trim().slice(0, 240);
}
