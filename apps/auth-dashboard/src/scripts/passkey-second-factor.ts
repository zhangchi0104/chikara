import {
  passkeyCeremonyMessage,
  supportsPasskeyAuthentication,
  verifyPasskeySecondFactor,
} from "./passkey-authentication.js";

const button = document.querySelector<HTMLButtonElement>(
  "[data-passkey-verification]",
);
const output = document.querySelector<HTMLElement>(
  "[data-passkey-verification-error]",
);

if (button && output) {
  if (!supportsPasskeyAuthentication()) {
    button.disabled = true;
    output.textContent =
      button.dataset.unavailable ??
      "Passkey verification is unavailable in this browser.";
    output.hidden = false;
  } else {
    button.addEventListener("click", () => {
      void (async () => {
        const label = button.textContent ?? "Use a passkey";
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.textContent = "Waiting for your passkey…";
        output.hidden = true;
        output.textContent = "";
        try {
          await verifyPasskeySecondFactor();
          window.location.assign(button.dataset.next ?? "/");
        } catch (error) {
          output.textContent = passkeyCeremonyMessage(error);
          output.hidden = false;
          button.disabled = false;
          button.removeAttribute("aria-busy");
          button.textContent = label;
        }
      })();
    });
  }
}
