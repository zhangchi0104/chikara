import {
  passkeyCeremonyMessage,
  signInWithPasskey,
  supportsPasskeyAuthentication,
} from "./passkey-authentication.js";

const button = document.querySelector<HTMLButtonElement>(
  "[data-passkey-sign-in]",
);
if (button) {
  const errorOutput = document.querySelector<HTMLElement>(
    "[data-passkey-error]",
  );
  if (!errorOutput) {
    throw new Error("Passkey sign-in is missing its error output.");
  }

  if (!supportsPasskeyAuthentication()) {
    button.disabled = true;
    button.title = "This browser does not support passkeys.";
    errorOutput.textContent =
      "Passkey sign-in is unavailable in this browser. Sign in with your password instead.";
    errorOutput.hidden = false;
  } else {
    button.addEventListener("click", () => {
      void (async () => {
        const originalLabel = button.textContent ?? "Use a passkey";
        errorOutput.hidden = true;
        errorOutput.textContent = "";
        button.disabled = true;
        button.textContent = "Waiting for your passkey…";
        try {
          await signInWithPasskey();
          window.location.assign("/");
        } catch (error) {
          errorOutput.textContent = passkeyCeremonyMessage(error);
          errorOutput.hidden = false;
          button.disabled = false;
          button.textContent = originalLabel;
        }
      })();
    });
  }
}
