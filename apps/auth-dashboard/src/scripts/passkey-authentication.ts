import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";
import {
  authenticationOptions,
  authenticationResponseBody,
  passkeyError,
  secondFactorAuthenticationOptions,
} from "../lib/passkey.js";
import { requestJSON } from "./browser.js";

type OptionsParser = (
  value: unknown,
) => PublicKeyCredentialRequestOptionsJSON | undefined;

function passkeyRequest(endpoint: string, body?: object) {
  return requestJSON(endpoint, {
    ...(body ? { body } : {}),
    failureMessage: (value) =>
      passkeyError(value, "Passkey sign-in could not be completed."),
  });
}

async function authenticate(parser: OptionsParser): Promise<unknown> {
  const options = parser(
    await passkeyRequest("/api/auth/passkey/generate-authenticate-options"),
  );
  if (!options) {
    throw new Error("The passkey challenge was incomplete. Start again.");
  }
  const response = await startAuthentication({ optionsJSON: options });
  return passkeyRequest("/api/auth/passkey/verify-authentication", {
    response: authenticationResponseBody(response),
  });
}

export function supportsPasskeyAuthentication(): boolean {
  return browserSupportsWebAuthn();
}

export function signInWithPasskey(): Promise<unknown> {
  return authenticate(authenticationOptions);
}

export function verifyPasskeySecondFactor(): Promise<unknown> {
  return authenticate(secondFactorAuthenticationOptions);
}

export function passkeyCeremonyMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Passkey sign-in was cancelled or timed out.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "Passkey sign-in could not be completed.";
}
