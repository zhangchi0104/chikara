import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";
import {
  authenticationOptions,
  authenticationResponseBody,
  passkeyError,
} from "../lib/passkey.js";
import { requestJSON } from "./browser.js";

const passkeyRequest = (endpoint: string, body?: object) =>
  requestJSON(endpoint, {
    ...(body ? { body } : {}),
    failureMessage: (value) =>
      passkeyError(value, "Passkey sign-in could not be completed."),
  });

function ceremonyMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Passkey sign-in was cancelled or timed out.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "Passkey sign-in could not be completed.";
}

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

  if (!browserSupportsWebAuthn()) {
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
          const options = authenticationOptions(
            await passkeyRequest(
              "/api/auth/passkey/generate-authenticate-options",
            ),
          );
          if (!options) {
            throw new Error(
              "The passkey challenge was incomplete. Start again.",
            );
          }
          const credential = await startAuthentication({
            optionsJSON: options,
          });
          await passkeyRequest("/api/auth/passkey/verify-authentication", {
            response: authenticationResponseBody(credential),
          });
          window.location.assign("/");
        } catch (error) {
          errorOutput.textContent = ceremonyMessage(error);
          errorOutput.hidden = false;
          button.disabled = false;
          button.textContent = originalLabel;
        }
      })();
    });
  }
}
