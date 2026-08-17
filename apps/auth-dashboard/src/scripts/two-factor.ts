import { authenticatorStateChangedEvent } from "../lib/account-protection.js";
import {
  backupCodeResult,
  setupSecret,
  TwoFactorWorkflow,
  twoFactorPresentation,
  twoFactorSetup,
  twoFactorState,
} from "../lib/two-factor.js";
import { hideDialog, showDialog } from "./dialog.js";
import {
  clearFormError,
  containingDialog,
  formValue,
  postJSON,
  required,
  runForm,
} from "./two-factor-form.js";

class OtakumaTwoFactorElement extends HTMLElement {
  readonly #workflow = new TwoFactorWorkflow("disabled");

  connectedCallback(): void {
    if (this.dataset.initialized === "true") return;
    const account = twoFactorState(this.dataset.twoFactorState);
    if (!account) throw new Error("Two-factor account state is invalid.");
    this.#workflow.setAccount(account);
    this.requireStructure();
    this.bindForms();
    this.bindActions();
    this.dataset.initialized = "true";
    this.render();
  }

  private requireStructure(): void {
    for (const selector of [
      "[data-two-factor-badge]",
      "[data-two-factor-status]",
      "[data-two-factor-enable-trigger]",
      "[data-two-factor-reset-trigger]",
      "[data-two-factor-setup]",
      "[data-two-factor-recovery]",
      "[data-two-factor-secret]",
      "[data-two-factor-open-app]",
      "[data-two-factor-setup-status]",
      "[data-two-factor-finish-later]",
      "[data-two-factor-recovery-codes]",
      "[data-two-factor-recovery-status]",
      "[data-two-factor-copy-secret]",
      "[data-two-factor-copy-recovery]",
      "[data-two-factor-acknowledge]",
    ]) {
      required(this, selector);
    }
    for (const selector of [
      "[data-two-factor-enable-form]",
      "[data-two-factor-reset-form]",
      "[data-two-factor-regenerate-form]",
    ]) {
      const form = required<HTMLFormElement>(this, selector);
      containingDialog(form);
      required(form, "[data-two-factor-error]");
    }
    required(
      required<HTMLFormElement>(this, "[data-two-factor-verify-form]"),
      "[data-two-factor-error]",
    );
  }

  private bindForms(): void {
    const enable = required<HTMLFormElement>(
      this,
      "[data-two-factor-enable-form]",
    );
    const verify = required<HTMLFormElement>(
      this,
      "[data-two-factor-verify-form]",
    );
    const reset = required<HTMLFormElement>(
      this,
      "[data-two-factor-reset-form]",
    );
    const regenerate = required<HTMLFormElement>(
      this,
      "[data-two-factor-regenerate-form]",
    );
    enable.addEventListener("submit", (event) => {
      event.preventDefault();
      void runForm(enable, "Generating…", () => this.enable(enable));
    });
    verify.addEventListener("submit", (event) => {
      event.preventDefault();
      void runForm(verify, "Verifying…", () => this.verify(verify));
    });
    reset.addEventListener("submit", (event) => {
      event.preventDefault();
      void runForm(reset, "Resetting…", () => this.reset(reset));
    });
    regenerate.addEventListener("submit", (event) => {
      event.preventDefault();
      void runForm(regenerate, "Generating…", () =>
        this.regenerate(regenerate),
      );
    });
    for (const form of [enable, reset, regenerate]) {
      containingDialog(form).addEventListener("close", () => {
        form.reset();
        clearFormError(form);
      });
    }
  }

  private bindActions(): void {
    required<HTMLButtonElement>(
      this,
      "[data-two-factor-finish-later]",
    ).addEventListener("click", () => {
      if (this.#workflow.finishLater()) this.render();
    });
    required(this, "[data-two-factor-copy-secret]").addEventListener(
      "click",
      () => void this.copySecret(),
    );
    required(this, "[data-two-factor-copy-recovery]").addEventListener(
      "click",
      () => void this.copyRecovery(),
    );
    required(this, "[data-two-factor-acknowledge]").addEventListener(
      "click",
      () => this.acknowledgeRecovery(),
    );
  }

  private async enable(form: HTMLFormElement): Promise<void> {
    const password = formValue(form, "password");
    if (this.#workflow.account === "pending") {
      await postJSON("/api/auth/two-factor/disable", { password });
      this.#workflow.setAccount("disabled");
      this.render();
    }
    const setup = twoFactorSetup(
      await postJSON("/api/auth/two-factor/enable", { password }),
    );
    if (!setup) {
      throw new Error("The setup response was incomplete. Try again.");
    }
    this.#workflow.startEnrollment(setup);
    hideDialog(containingDialog(form));
    this.render();
    required<HTMLInputElement>(
      this,
      '[data-two-factor-verify-form] input[name="code"]',
    ).focus();
  }

  private async verify(form: HTMLFormElement): Promise<void> {
    const setup = this.#workflow.beginVerification();
    if (!setup)
      throw new Error("Generate a setup key before verifying a code.");
    this.render();
    try {
      await postJSON("/api/auth/two-factor/verify-totp", {
        code: formValue(form, "code"),
      });
      this.#workflow.showRecovery(setup.backupCodes);
      this.render();
      this.showRecoveryDialog(
        required<HTMLElement>(this, "[data-two-factor-reset-trigger]"),
      );
    } catch (error) {
      this.#workflow.verificationFailed();
      this.render();
      throw error;
    }
  }

  private async reset(form: HTMLFormElement): Promise<void> {
    await postJSON("/api/auth/two-factor/disable", {
      password: formValue(form, "password"),
    });
    this.#workflow.setAccount("disabled");
    hideDialog(containingDialog(form));
    this.render();
    window.location.reload();
  }

  private async regenerate(form: HTMLFormElement): Promise<void> {
    const codes = backupCodeResult(
      await postJSON("/api/auth/two-factor/generate-backup-codes", {
        password: formValue(form, "password"),
      }),
    );
    if (!codes) throw new Error("The recovery-code response was incomplete.");
    hideDialog(containingDialog(form));
    this.#workflow.showRecovery(codes);
    this.render();
    this.showRecoveryDialog(
      required<HTMLElement>(this, "[data-two-factor-regenerate-trigger]"),
    );
  }

  private render(): void {
    const account = this.#workflow.account;
    const view = twoFactorPresentation[account];
    const current = this.#workflow.current;
    const badge = required<HTMLElement>(this, "[data-two-factor-badge]");
    const status = required<HTMLElement>(this, "[data-two-factor-status]");
    const enable = required<HTMLButtonElement>(
      this,
      "[data-two-factor-enable-trigger]",
    );
    const reset = required<HTMLButtonElement>(
      this,
      "[data-two-factor-reset-trigger]",
    );
    const enrolling = current.kind === "enrolling";
    badge.textContent = view.badge;
    badge.classList.toggle("neutral", account === "disabled");
    badge.classList.toggle(
      "warning",
      account === "pending" || account === "inconsistent",
    );
    status.textContent = view.message;
    status.dataset.state = view.tone;
    enable.hidden =
      enrolling || (account !== "disabled" && account !== "pending");
    enable.textContent =
      account === "pending" ? "Restart setup" : "Set up authenticator";
    reset.hidden = enrolling || account === "disabled";
    reset.textContent =
      account === "enabled" ? "Disable authenticator" : "Reset setup";
    reset.classList.toggle("button-danger", account === "enabled");
    required<HTMLElement>(this, "[data-two-factor-recovery]").hidden =
      account !== "enabled";
    required<HTMLElement>(this, "[data-two-factor-setup]").hidden =
      current.kind !== "enrolling";
    required<HTMLButtonElement>(
      this,
      "[data-two-factor-finish-later]",
    ).disabled = current.kind === "enrolling" && current.verifying;
    this.renderEnrollment();
    this.renderRecovery();
    this.dispatchEvent(
      new CustomEvent(authenticatorStateChangedEvent, {
        bubbles: true,
        detail: account,
      }),
    );
  }

  private renderEnrollment(): void {
    const current = this.#workflow.current;
    const secretOutput = required<HTMLElement>(
      this,
      "[data-two-factor-secret]",
    );
    const openApp = required<HTMLAnchorElement>(
      this,
      "[data-two-factor-open-app]",
    );
    if (current.kind !== "enrolling") {
      secretOutput.textContent = "";
      openApp.removeAttribute("href");
      return;
    }
    secretOutput.textContent = setupSecret(current.setup.totpURI) ?? "";
    openApp.href = current.setup.totpURI;
  }

  private renderRecovery(): void {
    const current = this.#workflow.current;
    const list = required<HTMLElement>(
      this,
      "[data-two-factor-recovery-codes]",
    );
    const codes = current.kind === "recovery" ? current.codes : [];
    list.replaceChildren(
      ...codes.map((code) => {
        const item = document.createElement("li");
        item.textContent = code;
        return item;
      }),
    );
  }

  private showRecoveryDialog(opener: HTMLElement): void {
    const list = required<HTMLElement>(
      this,
      "[data-two-factor-recovery-codes]",
    );
    const dialog = list.closest("dialog");
    if (!(dialog instanceof HTMLDialogElement)) {
      throw new Error("Recovery codes must be inside a dialog.");
    }
    const close = required<HTMLButtonElement>(dialog, "[data-close-dialog]");
    close.hidden = true;
    required<HTMLElement>(
      this,
      "[data-two-factor-recovery-status]",
    ).textContent = "";
    dialog.dataset.locked = "true";
    showDialog(dialog, opener);
  }

  private async copySecret(): Promise<void> {
    const current = this.#workflow.current;
    if (current.kind !== "enrolling") return;
    const status = required<HTMLElement>(
      this,
      "[data-two-factor-setup-status]",
    );
    try {
      await navigator.clipboard.writeText(
        setupSecret(current.setup.totpURI) ?? "",
      );
      status.textContent = "Setup key copied.";
    } catch {
      status.textContent =
        "Could not copy. Select the setup key and copy it manually.";
    }
  }

  private async copyRecovery(): Promise<void> {
    const current = this.#workflow.current;
    if (current.kind !== "recovery") return;
    const status = required<HTMLElement>(
      this,
      "[data-two-factor-recovery-status]",
    );
    try {
      await navigator.clipboard.writeText(current.codes.join("\n"));
      status.textContent = "Recovery codes copied.";
    } catch {
      status.textContent =
        "Could not copy. Select the codes and copy them manually.";
    }
  }

  private acknowledgeRecovery(): void {
    const list = required<HTMLElement>(
      this,
      "[data-two-factor-recovery-codes]",
    );
    const dialog = list.closest("dialog");
    if (!(dialog instanceof HTMLDialogElement)) return;
    this.#workflow.acknowledgeRecovery();
    delete dialog.dataset.locked;
    required<HTMLButtonElement>(dialog, "[data-close-dialog]").hidden = false;
    hideDialog(dialog);
    this.render();
    window.location.reload();
  }
}

if (!customElements.get("otakuma-two-factor")) {
  customElements.define("otakuma-two-factor", OtakumaTwoFactorElement);
}
