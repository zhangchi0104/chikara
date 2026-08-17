import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser";
import {
  accountProtection,
  authenticatorStateChangedEvent,
} from "../lib/account-protection.js";
import type { TwoFactorState } from "../lib/models.js";
import {
  type PasskeySummary,
  passkeyError,
  passkeyList,
  registrationOptions,
  registrationResponseBody,
} from "../lib/passkey.js";
import { twoFactorState } from "../lib/two-factor.js";
import { elementFinder, requestJSON } from "./browser.js";
import { hideDialog, showDialog } from "./dialog.js";

const required = elementFinder("Passkey management");

const passkeyRequest = (endpoint: string, body?: object) =>
  requestJSON(endpoint, {
    ...(body ? { body } : {}),
    failureMessage: (value, response) =>
      passkeyError(
        value,
        response.status === 401
          ? "Your session is no longer fresh. Sign in again before changing passkeys."
          : "The passkey change could not be completed.",
      ),
  });

function formInput(form: HTMLFormElement, name: string): HTMLInputElement {
  const input = form.elements.namedItem(name);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Passkey form is missing ${name}.`);
  }
  return input;
}

function ceremonyMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Passkey setup was cancelled or timed out.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "The passkey change could not be completed.";
}

class PasskeyManager {
  #authenticatorState: TwoFactorState;
  readonly #empty: HTMLElement;
  readonly #list: HTMLElement;
  readonly #mfaBadge: HTMLElement;
  readonly #mfaStatus: HTMLElement;
  readonly #registerDialog: HTMLDialogElement;
  readonly #registerError: HTMLElement;
  readonly #registerForm: HTMLFormElement;
  readonly #registerTrigger: HTMLButtonElement;
  readonly #renameDialog: HTMLDialogElement;
  readonly #renameError: HTMLElement;
  readonly #renameForm: HTMLFormElement;
  readonly #root: HTMLElement;
  readonly #status: HTMLElement;
  readonly #support: HTMLElement;
  #passkeyCount: number;
  #passkeys: ReadonlyArray<PasskeySummary> = [];

  constructor(root: HTMLElement) {
    const authenticatorState = twoFactorState(root.dataset.authenticatorState);
    const passkeyCount = Number(root.dataset.passkeyCount);
    if (
      !authenticatorState ||
      !Number.isSafeInteger(passkeyCount) ||
      passkeyCount < 0
    ) {
      throw new Error("Account protection state is invalid.");
    }
    this.#authenticatorState = authenticatorState;
    this.#passkeyCount = passkeyCount;
    this.#root = root;
    this.#empty = required(root, "[data-passkey-empty]");
    this.#list = required(root, "[data-passkey-list]");
    this.#mfaBadge = required(root, "[data-mfa-badge]");
    this.#mfaStatus = required(root, "[data-mfa-status]");
    this.#registerForm = required(root, "[data-passkey-register-form]");
    this.#renameForm = required(root, "[data-passkey-rename-form]");
    this.#registerTrigger = required(root, "[data-passkey-register-trigger]");
    this.#status = required(root, "[data-passkey-status]");
    this.#support = required(root, "[data-passkey-support]");
    this.#registerError = required(
      this.#registerForm,
      "[data-passkey-register-error]",
    );
    this.#renameError = required(
      this.#renameForm,
      "[data-passkey-rename-error]",
    );
    const registerDialog = this.#registerForm.closest("dialog");
    const renameDialog = this.#renameForm.closest("dialog");
    if (
      !(registerDialog instanceof HTMLDialogElement) ||
      !(renameDialog instanceof HTMLDialogElement)
    ) {
      throw new Error("Passkey forms must be inside dialogs.");
    }
    this.#registerDialog = registerDialog;
    this.#renameDialog = renameDialog;
  }

  initialize(): void {
    const supportsRegistration = browserSupportsWebAuthn();
    if (!supportsRegistration) {
      this.#support.textContent = "Unavailable";
      this.#support.classList.add("neutral");
      this.#registerTrigger.disabled = true;
      this.#registerTrigger.title =
        "This browser cannot create passkeys. You can still manage existing ones.";
    } else {
      this.#support.textContent = "Supported";
      this.#support.classList.remove("neutral");
      this.#registerForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void this.register();
      });
    }
    this.renderProtection();
    this.#renameForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.rename();
    });
    this.#root.addEventListener(authenticatorStateChangedEvent, (event) => {
      if (!(event instanceof CustomEvent)) return;
      const state = twoFactorState(event.detail);
      if (!state || state === this.#authenticatorState) return;
      this.#authenticatorState = state;
      this.renderProtection();
    });
    this.#list.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const rename = target.closest<HTMLButtonElement>("[data-passkey-rename]");
      if (rename?.dataset.passkeyId) this.openRename(rename);
      const remove = target.closest<HTMLButtonElement>("[data-passkey-delete]");
      if (remove?.dataset.passkeyId) void this.remove(remove);
    });
    void this.load();
  }

  private setStatus(
    message: string,
    state: "error" | "pending" | "ready",
  ): void {
    this.#status.textContent = message;
    this.#status.dataset.state = state;
  }

  private showFormError(output: HTMLElement, message: string): void {
    output.textContent = message;
    output.hidden = false;
  }

  private async load(): Promise<void> {
    this.setStatus("Loading your passkeys…", "pending");
    try {
      const passkeys = passkeyList(
        await passkeyRequest("/api/auth/passkey/list-user-passkeys"),
      );
      if (!passkeys) {
        throw new Error("The passkey list response was incomplete.");
      }
      this.#passkeys = passkeys;
      this.#passkeyCount = passkeys.length;
      this.render();
      this.setStatus(
        passkeys.length
          ? `${passkeys.length} ${passkeys.length === 1 ? "passkey is" : "passkeys are"} ready for sign-in.`
          : "No passkeys are registered yet.",
        "ready",
      );
    } catch (error) {
      this.setStatus(ceremonyMessage(error), "error");
    }
  }

  private render(): void {
    this.renderProtection();
    this.#empty.hidden = this.#passkeys.length > 0;
    this.#list.hidden = this.#passkeys.length === 0;
    this.#list.replaceChildren(
      ...this.#passkeys.map((passkey, index) => {
        const item = document.createElement("li");
        item.className = "security-list-item";
        const copy = document.createElement("span");
        copy.className = "security-list-copy";
        const name = document.createElement("strong");
        name.textContent = passkey.name ?? `Passkey ${index + 1}`;
        const detail = document.createElement("small");
        const created = new Intl.DateTimeFormat("en", {
          dateStyle: "medium",
        }).format(new Date(passkey.createdAt));
        detail.textContent = `${passkey.backedUp ? "Synced" : "Device-bound"} · Added ${created}`;
        copy.appendChild(name);
        copy.appendChild(detail);
        const actions = document.createElement("span");
        actions.className = "security-list-actions";
        const rename = document.createElement("button");
        rename.className = "button button-small";
        rename.type = "button";
        rename.textContent = "Rename";
        rename.dataset.passkeyId = passkey.id;
        rename.dataset.passkeyRename = "";
        rename.dataset.passkeyName = passkey.name ?? "";
        const remove = document.createElement("button");
        remove.className = "button button-small button-danger";
        remove.type = "button";
        remove.textContent = "Delete";
        remove.dataset.passkeyDelete = "";
        remove.dataset.passkeyId = passkey.id;
        actions.appendChild(rename);
        actions.appendChild(remove);
        item.appendChild(copy);
        item.appendChild(actions);
        return item;
      }),
    );
  }

  private renderProtection(): void {
    const presentation = accountProtection(
      this.#passkeyCount,
      this.#authenticatorState,
    );
    this.#mfaBadge.textContent = presentation.badge;
    this.#mfaBadge.classList.toggle("warning", presentation.tone === "warning");
    if (this.#mfaStatus.textContent !== presentation.message) {
      this.#mfaStatus.textContent = presentation.message;
    }
    this.#mfaStatus.dataset.state = presentation.tone;
  }

  private async register(): Promise<void> {
    const submit = required<HTMLButtonElement>(
      this.#registerForm,
      'button[type="submit"]',
    );
    const name = formInput(this.#registerForm, "name").value.trim();
    this.#registerError.hidden = true;
    submit.disabled = true;
    try {
      const options = registrationOptions(
        await passkeyRequest("/api/auth/passkey/generate-register-options"),
      );
      if (!options) {
        throw new Error("The passkey setup challenge was incomplete.");
      }
      const credential = await startRegistration({ optionsJSON: options });
      await passkeyRequest("/api/auth/passkey/verify-registration", {
        ...(name ? { name } : {}),
        response: registrationResponseBody(credential),
      });
      this.#passkeyCount += 1;
      this.renderProtection();
      this.#registerForm.reset();
      hideDialog(this.#registerDialog);
      await this.load();
    } catch (error) {
      this.showFormError(this.#registerError, ceremonyMessage(error));
    } finally {
      submit.disabled = false;
    }
  }

  private openRename(button: HTMLButtonElement): void {
    formInput(this.#renameForm, "id").value = button.dataset.passkeyId ?? "";
    formInput(this.#renameForm, "name").value =
      button.dataset.passkeyName ?? "";
    this.#renameError.hidden = true;
    showDialog(this.#renameDialog, button);
    formInput(this.#renameForm, "name").focus();
  }

  private async rename(): Promise<void> {
    const submit = required<HTMLButtonElement>(
      this.#renameForm,
      'button[type="submit"]',
    );
    const id = formInput(this.#renameForm, "id").value;
    const name = formInput(this.#renameForm, "name").value.trim();
    this.#renameError.hidden = true;
    submit.disabled = true;
    try {
      await passkeyRequest("/api/auth/passkey/update-passkey", { id, name });
      hideDialog(this.#renameDialog);
      await this.load();
    } catch (error) {
      this.showFormError(this.#renameError, ceremonyMessage(error));
    } finally {
      submit.disabled = false;
    }
  }

  private async remove(button: HTMLButtonElement): Promise<void> {
    if (!button.dataset.passkeyId) return;
    if (
      !window.confirm("Delete this passkey? It will stop working immediately.")
    ) {
      return;
    }
    button.disabled = true;
    try {
      await passkeyRequest("/api/auth/passkey/delete-passkey", {
        id: button.dataset.passkeyId,
      });
      this.#passkeys = this.#passkeys.filter(
        (passkey) => passkey.id !== button.dataset.passkeyId,
      );
      this.#passkeyCount = Math.max(0, this.#passkeyCount - 1);
      this.render();
      await this.load();
    } catch (error) {
      this.setStatus(ceremonyMessage(error), "error");
      button.disabled = false;
    }
  }
}

const securityPage = document.querySelector<HTMLElement>(
  "[data-security-page]",
);
if (securityPage) new PasskeyManager(securityPage).initialize();
