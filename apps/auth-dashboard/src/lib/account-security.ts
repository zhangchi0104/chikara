import type {
  RegistrationResponseJSON,
  StartRegistrationOpts,
} from "@simplewebauthn/browser";
import { accountProtection } from "./account-protection.js";
import type { TwoFactorState } from "./models.js";
import {
  type PasskeySummary,
  passkeyList,
  registrationOptions,
  registrationResponseBody,
} from "./passkey.js";
import {
  backupCodeResult,
  type TwoFactorSetup,
  twoFactorSetup,
} from "./two-factor.js";

export interface AccountSecurityPort {
  createPasskey(
    options: StartRegistrationOpts,
  ): Promise<RegistrationResponseJSON>;
  deletePasskey(id: string): Promise<void>;
  disableAuthenticator(password: string): Promise<void>;
  enableAuthenticator(password: string): Promise<unknown>;
  listPasskeys(): Promise<unknown>;
  regenerateRecoveryCodes(password: string): Promise<unknown>;
  registrationOptions(): Promise<unknown>;
  renamePasskey(id: string, name: string): Promise<void>;
  supportsPasskeys(): boolean;
  verifyAuthenticator(code: string): Promise<void>;
  verifyPasskeyRegistration(
    response: Omit<RegistrationResponseJSON, "clientExtensionResults">,
    name?: string,
  ): Promise<void>;
}

export type AuthenticatorWorkflow =
  | { readonly account: TwoFactorState; readonly kind: "account" }
  | {
      readonly kind: "enrolling";
      readonly setup: TwoFactorSetup;
      readonly verifying: boolean;
    }
  | { readonly codes: ReadonlyArray<string>; readonly kind: "recovery" };

export interface AccountSecuritySnapshot {
  readonly authenticator: AuthenticatorWorkflow;
  readonly authenticatorState: TwoFactorState;
  readonly passkeyCount: number;
  readonly passkeyListState: "ready" | "stale" | "unloaded";
  readonly passkeys: ReadonlyArray<PasskeySummary>;
  readonly protection: ReturnType<typeof accountProtection>;
}

function authenticatorState(flow: AuthenticatorWorkflow): TwoFactorState {
  if (flow.kind === "enrolling") return "pending";
  if (flow.kind === "recovery") return "enabled";
  return flow.account;
}

export class AccountSecurityWorkflow {
  #authenticator: AuthenticatorWorkflow;
  readonly #listeners = new Set<() => void>();
  #passkeyCount: number;
  #passkeyListState: AccountSecuritySnapshot["passkeyListState"] = "unloaded";
  #passkeys: ReadonlyArray<PasskeySummary> = [];

  constructor(
    initial: {
      readonly authenticatorState: TwoFactorState;
      readonly passkeyCount: number;
    },
    private readonly port: AccountSecurityPort,
  ) {
    if (
      !Number.isSafeInteger(initial.passkeyCount) ||
      initial.passkeyCount < 0
    ) {
      throw new Error("Account protection state is invalid.");
    }
    this.#authenticator = {
      account: initial.authenticatorState,
      kind: "account",
    };
    this.#passkeyCount = initial.passkeyCount;
  }

  get current(): AccountSecuritySnapshot {
    const state = authenticatorState(this.#authenticator);
    return {
      authenticator: this.#authenticator,
      authenticatorState: state,
      passkeyCount: this.#passkeyCount,
      passkeyListState: this.#passkeyListState,
      passkeys: this.#passkeys,
      protection: accountProtection(this.#passkeyCount, state),
    };
  }

  supportsPasskeys(): boolean {
    return this.port.supportsPasskeys();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async loadPasskeys(): Promise<void> {
    const passkeys = passkeyList(await this.port.listPasskeys());
    if (!passkeys) throw new Error("The passkey list response was incomplete.");
    this.#passkeys = passkeys;
    this.#passkeyCount = passkeys.length;
    this.#passkeyListState = "ready";
    this.notify();
  }

  async registerPasskey(name: string): Promise<void> {
    const options = registrationOptions(await this.port.registrationOptions());
    if (!options)
      throw new Error("The passkey setup challenge was incomplete.");
    const response = await this.port.createPasskey({ optionsJSON: options });
    await this.port.verifyPasskeyRegistration(
      registrationResponseBody(response),
      name || undefined,
    );
    this.#passkeyCount += 1;
    this.notify();
    await this.refreshPasskeys();
  }

  async renamePasskey(id: string, name: string): Promise<void> {
    const previous = this.#passkeys;
    this.#passkeys = previous.map((passkey) =>
      passkey.id === id ? { ...passkey, name } : passkey,
    );
    this.notify();
    try {
      await this.port.renamePasskey(id, name);
    } catch (error) {
      this.#passkeys = previous;
      this.notify();
      throw error;
    }
    await this.refreshPasskeys();
  }

  async deletePasskey(id: string): Promise<void> {
    const previous = this.#passkeys;
    const previousCount = this.#passkeyCount;
    this.#passkeys = previous.filter((passkey) => passkey.id !== id);
    this.#passkeyCount = Math.max(0, previousCount - 1);
    this.notify();
    try {
      await this.port.deletePasskey(id);
    } catch (error) {
      this.#passkeys = previous;
      this.#passkeyCount = previousCount;
      this.notify();
      throw error;
    }
    await this.refreshPasskeys();
  }

  async enableAuthenticator(password: string): Promise<void> {
    if (this.current.authenticatorState === "pending") {
      await this.port.disableAuthenticator(password);
      this.setAuthenticator("disabled");
    }
    const setup = twoFactorSetup(await this.port.enableAuthenticator(password));
    if (!setup)
      throw new Error("The setup response was incomplete. Try again.");
    this.#authenticator = { kind: "enrolling", setup, verifying: false };
    this.notify();
  }

  async verifyAuthenticator(code: string): Promise<void> {
    const current = this.#authenticator;
    if (current.kind !== "enrolling" || current.verifying) {
      throw new Error("Generate a setup key before verifying a code.");
    }
    this.#authenticator = { ...current, verifying: true };
    this.notify();
    try {
      await this.port.verifyAuthenticator(code);
      this.#authenticator = {
        codes: [...current.setup.backupCodes],
        kind: "recovery",
      };
      this.notify();
    } catch (error) {
      this.#authenticator = { ...current, verifying: false };
      this.notify();
      throw error;
    }
  }

  finishAuthenticatorLater(): boolean {
    if (
      this.#authenticator.kind !== "enrolling" ||
      this.#authenticator.verifying
    ) {
      return false;
    }
    this.setAuthenticator("pending");
    return true;
  }

  async resetAuthenticator(password: string): Promise<void> {
    await this.port.disableAuthenticator(password);
    this.setAuthenticator("disabled");
  }

  async regenerateRecoveryCodes(password: string): Promise<void> {
    const codes = backupCodeResult(
      await this.port.regenerateRecoveryCodes(password),
    );
    if (!codes) throw new Error("The recovery-code response was incomplete.");
    this.#authenticator = { codes: [...codes], kind: "recovery" };
    this.notify();
  }

  acknowledgeRecoveryCodes(): void {
    if (this.#authenticator.kind === "recovery") {
      this.setAuthenticator("enabled");
    }
  }

  private setAuthenticator(account: TwoFactorState): void {
    this.#authenticator = { account, kind: "account" };
    this.notify();
  }

  private async refreshPasskeys(): Promise<void> {
    try {
      await this.loadPasskeys();
    } catch {
      this.#passkeyListState = "stale";
      this.notify();
    }
  }

  private notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
