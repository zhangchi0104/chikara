import { errorMessage } from "../lib/two-factor.js";
import { elementFinder, requestJSON } from "./browser.js";

export const required = elementFinder("Two-factor setup");

export function containingDialog(form: HTMLFormElement): HTMLDialogElement {
  const dialog = form.closest("dialog");
  if (!(dialog instanceof HTMLDialogElement)) {
    throw new Error("Two-factor forms must be inside dialogs.");
  }
  return dialog;
}

export async function postJSON(
  endpoint: string,
  body: object,
): Promise<unknown> {
  return requestJSON(endpoint, {
    body,
    failureMessage: (value, response) =>
      response.status === 401
        ? "Your session expired. Sign in again before changing two-factor authentication."
        : errorMessage(
            value,
            "The security change could not be completed. Try again.",
          ),
  });
}

export function formValue(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value : "";
}

export function clearFormError(form: HTMLFormElement): void {
  const output = required<HTMLElement>(form, "[data-two-factor-error]");
  output.textContent = "";
  output.hidden = true;
}

function showFormError(form: HTMLFormElement, message: string): void {
  const output = required<HTMLElement>(form, "[data-two-factor-error]");
  output.textContent = message;
  output.hidden = false;
}

export async function runForm(
  form: HTMLFormElement,
  pendingLabel: string,
  task: () => Promise<void>,
): Promise<void> {
  const button = required<HTMLButtonElement>(form, 'button[type="submit"]');
  const label = button.textContent ?? "Continue";
  clearFormError(form);
  form.setAttribute("aria-busy", "true");
  button.disabled = true;
  button.textContent = pendingLabel;
  try {
    await task();
  } catch (error) {
    showFormError(
      form,
      error instanceof Error
        ? error.message
        : "The security change could not be completed. Try again.",
    );
  } finally {
    form.removeAttribute("aria-busy");
    button.disabled = false;
    button.textContent = label;
  }
}
