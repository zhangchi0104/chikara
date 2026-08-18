import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser";
import type { AccountSecurityPort } from "../lib/account-security.js";
import { passkeyError } from "../lib/passkey.js";
import { errorMessage } from "../lib/two-factor.js";
import { requestJSON } from "./browser.js";

function passkeyRequest(endpoint: string, body?: object): Promise<unknown> {
  return requestJSON(endpoint, {
    ...(body ? { body } : {}),
    failureMessage: (value, response) =>
      passkeyError(
        value,
        response.status === 401
          ? "Your session is no longer fresh. Sign in again before changing passkeys."
          : "The passkey change could not be completed.",
      ),
  });
}

function authenticatorRequest(
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

export function createAccountSecurityPort(): AccountSecurityPort {
  return {
    createPasskey: (options) => startRegistration(options),
    deletePasskey: async (id) => {
      await passkeyRequest("/api/auth/passkey/delete-passkey", { id });
    },
    disableAuthenticator: async (password) => {
      await authenticatorRequest("/api/auth/two-factor/disable", { password });
    },
    enableAuthenticator: (password) =>
      authenticatorRequest("/api/auth/two-factor/enable", { password }),
    listPasskeys: () => passkeyRequest("/api/auth/passkey/list-user-passkeys"),
    regenerateRecoveryCodes: (password) =>
      authenticatorRequest("/api/auth/two-factor/generate-backup-codes", {
        password,
      }),
    registrationOptions: () =>
      passkeyRequest("/api/auth/passkey/generate-register-options"),
    renamePasskey: async (id, name) => {
      await passkeyRequest("/api/auth/passkey/update-passkey", { id, name });
    },
    supportsPasskeys: browserSupportsWebAuthn,
    verifyAuthenticator: async (code) => {
      await authenticatorRequest("/api/auth/two-factor/verify-totp", { code });
    },
    verifyPasskeyRegistration: async (response, name) => {
      await passkeyRequest("/api/auth/passkey/verify-registration", {
        ...(name ? { name } : {}),
        response,
      });
    },
  };
}
