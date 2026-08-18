import type {
  AccountSecuritySnapshot,
  AccountSecurityWorkflow,
} from "../lib/account-security.js";
import { hideDialog, showDialog } from "./dialog.js";
import { required } from "./security-form.js";

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

export class PasskeyPanel {
  readonly #empty: HTMLElement;
  readonly #list: HTMLElement;
  readonly #registerDialog: HTMLDialogElement;
  readonly #registerError: HTMLElement;
  readonly #registerForm: HTMLFormElement;
  readonly #registerTrigger: HTMLButtonElement;
  readonly #renameDialog: HTMLDialogElement;
  readonly #renameError: HTMLElement;
  readonly #renameForm: HTMLFormElement;
  readonly #status: HTMLElement;
  readonly #support: HTMLElement;

  constructor(
    root: HTMLElement,
    private readonly workflow: AccountSecurityWorkflow,
  ) {
    this.#empty = required(root, "[data-passkey-empty]");
    this.#list = required(root, "[data-passkey-list]");
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
    if (!this.workflow.supportsPasskeys()) {
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
    this.#renameForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.rename();
    });
    this.#list.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const rename = target.closest<HTMLButtonElement>("[data-passkey-rename]");
      if (rename?.dataset.passkeyId) this.openRename(rename);
      const remove = target.closest<HTMLButtonElement>("[data-passkey-delete]");
      if (remove?.dataset.passkeyId) void this.remove(remove);
    });
    this.workflow.subscribe(() => this.render(this.workflow.current));
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
      await this.workflow.loadPasskeys();
    } catch (error) {
      this.setStatus(ceremonyMessage(error), "error");
    }
  }

  private render(snapshot: AccountSecuritySnapshot): void {
    if (snapshot.passkeyListState === "unloaded") return;
    if (snapshot.passkeyListState === "stale") {
      this.setStatus(
        "The change was saved, but the latest passkey list could not be loaded. Reload to try again.",
        "error",
      );
    } else {
      this.setStatus(
        snapshot.passkeys.length
          ? `${snapshot.passkeys.length} ${snapshot.passkeys.length === 1 ? "passkey is" : "passkeys are"} ready for sign-in.`
          : "No passkeys are registered yet.",
        "ready",
      );
    }
    this.#empty.hidden = snapshot.passkeys.length > 0;
    this.#list.hidden = snapshot.passkeys.length === 0;
    this.#list.replaceChildren(
      ...snapshot.passkeys.map((passkey, index) => {
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

  private async register(): Promise<void> {
    const submit = required<HTMLButtonElement>(
      this.#registerForm,
      'button[type="submit"]',
    );
    const name = formInput(this.#registerForm, "name").value.trim();
    this.#registerError.hidden = true;
    submit.disabled = true;
    try {
      await this.workflow.registerPasskey(name);
      this.#registerForm.reset();
      hideDialog(this.#registerDialog);
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
    this.#renameError.hidden = true;
    submit.disabled = true;
    try {
      await this.workflow.renamePasskey(
        formInput(this.#renameForm, "id").value,
        formInput(this.#renameForm, "name").value.trim(),
      );
      hideDialog(this.#renameDialog);
    } catch (error) {
      this.showFormError(this.#renameError, ceremonyMessage(error));
    } finally {
      submit.disabled = false;
    }
  }

  private async remove(button: HTMLButtonElement): Promise<void> {
    const id = button.dataset.passkeyId;
    if (
      !id ||
      !window.confirm("Delete this passkey? It will stop working immediately.")
    ) {
      return;
    }
    button.disabled = true;
    try {
      await this.workflow.deletePasskey(id);
    } catch (error) {
      this.setStatus(ceremonyMessage(error), "error");
      button.disabled = false;
    }
  }
}
