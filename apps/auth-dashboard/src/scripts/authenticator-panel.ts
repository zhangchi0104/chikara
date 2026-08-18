import type {
  AccountSecuritySnapshot,
  AccountSecurityWorkflow,
  AuthenticatorWorkflow,
} from "../lib/account-security.js";
import { setupSecret, twoFactorPresentation } from "../lib/two-factor.js";
import { hideDialog, showDialog } from "./dialog.js";
import {
  clearFormError,
  containingDialog,
  formValue,
  required,
  runForm,
} from "./security-form.js";

export class AuthenticatorPanel {
  constructor(
    private readonly root: HTMLElement,
    private readonly workflow: AccountSecurityWorkflow,
  ) {}

  initialize(): void {
    this.requireStructure();
    this.bindForms();
    this.bindActions();
    this.workflow.subscribe(() => this.render(this.workflow.current));
    this.render(this.workflow.current);
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
      required(this.root, selector);
    }
    for (const selector of [
      "[data-two-factor-enable-form]",
      "[data-two-factor-reset-form]",
      "[data-two-factor-regenerate-form]",
    ]) {
      const form = required<HTMLFormElement>(this.root, selector);
      containingDialog(form);
      required(form, "[data-two-factor-error]");
    }
    required(
      required<HTMLFormElement>(this.root, "[data-two-factor-verify-form]"),
      "[data-two-factor-error]",
    );
  }

  private bindForms(): void {
    const enable = required<HTMLFormElement>(
      this.root,
      "[data-two-factor-enable-form]",
    );
    const verify = required<HTMLFormElement>(
      this.root,
      "[data-two-factor-verify-form]",
    );
    const reset = required<HTMLFormElement>(
      this.root,
      "[data-two-factor-reset-form]",
    );
    const regenerate = required<HTMLFormElement>(
      this.root,
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
      this.root,
      "[data-two-factor-finish-later]",
    ).addEventListener("click", () => {
      this.workflow.finishAuthenticatorLater();
    });
    required(this.root, "[data-two-factor-copy-secret]").addEventListener(
      "click",
      () => void this.copySecret(),
    );
    required(this.root, "[data-two-factor-copy-recovery]").addEventListener(
      "click",
      () => void this.copyRecovery(),
    );
    required(this.root, "[data-two-factor-acknowledge]").addEventListener(
      "click",
      () => this.acknowledgeRecovery(),
    );
  }

  private async enable(form: HTMLFormElement): Promise<void> {
    await this.workflow.enableAuthenticator(formValue(form, "password"));
    hideDialog(containingDialog(form));
    required<HTMLInputElement>(
      this.root,
      '[data-two-factor-verify-form] input[name="code"]',
    ).focus();
  }

  private async verify(form: HTMLFormElement): Promise<void> {
    await this.workflow.verifyAuthenticator(formValue(form, "code"));
    this.showRecoveryDialog(
      required<HTMLElement>(this.root, "[data-two-factor-reset-trigger]"),
    );
  }

  private async reset(form: HTMLFormElement): Promise<void> {
    await this.workflow.resetAuthenticator(formValue(form, "password"));
    hideDialog(containingDialog(form));
    window.location.reload();
  }

  private async regenerate(form: HTMLFormElement): Promise<void> {
    await this.workflow.regenerateRecoveryCodes(formValue(form, "password"));
    hideDialog(containingDialog(form));
    this.showRecoveryDialog(
      required<HTMLElement>(this.root, "[data-two-factor-regenerate-trigger]"),
    );
  }

  private render(snapshot: AccountSecuritySnapshot): void {
    const account = snapshot.authenticatorState;
    const view = twoFactorPresentation[account];
    const current = snapshot.authenticator;
    const badge = required<HTMLElement>(this.root, "[data-two-factor-badge]");
    const status = required<HTMLElement>(this.root, "[data-two-factor-status]");
    const enable = required<HTMLButtonElement>(
      this.root,
      "[data-two-factor-enable-trigger]",
    );
    const reset = required<HTMLButtonElement>(
      this.root,
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
    required<HTMLElement>(this.root, "[data-two-factor-recovery]").hidden =
      account !== "enabled";
    required<HTMLElement>(this.root, "[data-two-factor-setup]").hidden =
      current.kind !== "enrolling";
    required<HTMLButtonElement>(
      this.root,
      "[data-two-factor-finish-later]",
    ).disabled = current.kind === "enrolling" && current.verifying;
    this.renderEnrollment(current);
    this.renderRecovery(current);
  }

  private renderEnrollment(current: AuthenticatorWorkflow): void {
    const output = required<HTMLElement>(this.root, "[data-two-factor-secret]");
    const openApp = required<HTMLAnchorElement>(
      this.root,
      "[data-two-factor-open-app]",
    );
    if (current.kind !== "enrolling") {
      output.textContent = "";
      openApp.removeAttribute("href");
      return;
    }
    output.textContent = setupSecret(current.setup.totpURI) ?? "";
    openApp.href = current.setup.totpURI;
  }

  private renderRecovery(current: AuthenticatorWorkflow): void {
    const list = required<HTMLElement>(
      this.root,
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
      this.root,
      "[data-two-factor-recovery-codes]",
    );
    const dialog = list.closest("dialog");
    if (!(dialog instanceof HTMLDialogElement)) {
      throw new Error("Recovery codes must be inside a dialog.");
    }
    required<HTMLButtonElement>(dialog, "[data-close-dialog]").hidden = true;
    required<HTMLElement>(
      this.root,
      "[data-two-factor-recovery-status]",
    ).textContent = "";
    dialog.dataset.locked = "true";
    showDialog(dialog, opener);
  }

  private async copySecret(): Promise<void> {
    const current = this.workflow.current.authenticator;
    if (current.kind !== "enrolling") return;
    const status = required<HTMLElement>(
      this.root,
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
    const current = this.workflow.current.authenticator;
    if (current.kind !== "recovery") return;
    const status = required<HTMLElement>(
      this.root,
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
      this.root,
      "[data-two-factor-recovery-codes]",
    );
    const dialog = list.closest("dialog");
    if (!(dialog instanceof HTMLDialogElement)) return;
    this.workflow.acknowledgeRecoveryCodes();
    delete dialog.dataset.locked;
    required<HTMLButtonElement>(dialog, "[data-close-dialog]").hidden = false;
    hideDialog(dialog);
    window.location.reload();
  }
}
