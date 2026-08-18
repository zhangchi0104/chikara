import { AccountSecurityWorkflow } from "../lib/account-security.js";
import { twoFactorState } from "../lib/two-factor.js";
import { createAccountSecurityPort } from "./account-security-port.js";
import { AuthenticatorPanel } from "./authenticator-panel.js";
import { PasskeyPanel } from "./passkey-panel.js";
import { required } from "./security-form.js";

const root = document.querySelector<HTMLElement>("[data-security-page]");
if (root) {
  const state = twoFactorState(root.dataset.authenticatorState);
  const passkeyCount = Number(root.dataset.passkeyCount);
  if (!state || !Number.isSafeInteger(passkeyCount) || passkeyCount < 0) {
    throw new Error("Account protection state is invalid.");
  }
  const workflow = new AccountSecurityWorkflow(
    { authenticatorState: state, passkeyCount },
    createAccountSecurityPort(),
  );
  const renderProtection = () => {
    const presentation = workflow.current.protection;
    const badge = required<HTMLElement>(root, "[data-mfa-badge]");
    const status = required<HTMLElement>(root, "[data-mfa-status]");
    badge.textContent = presentation.badge;
    badge.classList.toggle("warning", presentation.tone === "warning");
    status.textContent = presentation.message;
    status.dataset.state = presentation.tone;
  };
  workflow.subscribe(renderProtection);
  renderProtection();
  new AuthenticatorPanel(
    required<HTMLElement>(root, "otakuma-two-factor"),
    workflow,
  ).initialize();
  new PasskeyPanel(root, workflow).initialize();
}
