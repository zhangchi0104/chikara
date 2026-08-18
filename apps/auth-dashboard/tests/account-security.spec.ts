import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { describe, expect, it } from "vitest";
import {
  type AccountSecurityPort,
  AccountSecurityWorkflow,
} from "../src/lib/account-security.js";

type AccountSecurityOperation =
  | "delete-passkey"
  | "disable-authenticator"
  | "enable-authenticator"
  | "list-passkeys"
  | "new-recovery-codes"
  | "passkey-registration-options"
  | "rename-passkey"
  | "verify-authenticator"
  | "verify-passkey-registration";

type Execute = (
  operation: AccountSecurityOperation,
  body?: object,
) => Promise<unknown>;

const registration: RegistrationResponseJSON = {
  authenticatorAttachment: "platform",
  clientExtensionResults: { credProps: { rk: true } },
  id: "credential-1",
  rawId: "credential-1",
  response: {
    attestationObject: "attestation",
    clientDataJSON: "client-data",
    transports: ["internal"],
  },
  type: "public-key",
};

function passkey(id: string, name: string) {
  return {
    backedUp: true,
    createdAt: "2026-08-17T00:00:00.000Z",
    deviceType: "multiDevice",
    id,
    name,
  };
}

function port(execute: Execute): AccountSecurityPort {
  const discard = async (
    operation: AccountSecurityOperation,
    body?: object,
  ): Promise<void> => {
    await execute(operation, body);
  };
  return {
    createPasskey: async () => registration,
    deletePasskey: (id) => discard("delete-passkey", { id }),
    disableAuthenticator: (password) =>
      discard("disable-authenticator", { password }),
    enableAuthenticator: (password) =>
      execute("enable-authenticator", { password }),
    listPasskeys: () => execute("list-passkeys"),
    regenerateRecoveryCodes: (password) =>
      execute("new-recovery-codes", { password }),
    registrationOptions: () => execute("passkey-registration-options"),
    renamePasskey: (id, name) => discard("rename-passkey", { id, name }),
    supportsPasskeys: () => true,
    verifyAuthenticator: (code) =>
      discard("verify-authenticator", { code }),
    verifyPasskeyRegistration: (response, name) =>
      discard("verify-passkey-registration", {
        ...(name ? { name } : {}),
        response,
      }),
  };
}

describe("account security workflow", () => {
  it("coordinates the loaded passkeys with aggregate account protection", async () => {
    const workflow = new AccountSecurityWorkflow(
      { authenticatorState: "disabled", passkeyCount: 0 },
      port(async (operation) =>
        operation === "list-passkeys" ? [passkey("passkey-1", "Laptop")] : {},
      ),
    );
    const updates: string[] = [];
    workflow.subscribe(() => updates.push(workflow.current.protection.badge));

    await workflow.loadPasskeys();

    expect(workflow.current.passkeyCount).toBe(1);
    expect(workflow.current.passkeyListState).toBe("ready");
    expect(workflow.current.protection).toMatchObject({
      badge: "Enabled",
      tone: "ready",
    });
    expect(updates).toEqual(["Enabled"]);
  });

  it("restarts a pending authenticator and publishes one shared state", async () => {
    const operations: AccountSecurityOperation[] = [];
    const workflow = new AccountSecurityWorkflow(
      { authenticatorState: "pending", passkeyCount: 0 },
      port(async (operation) => {
        operations.push(operation);
        if (operation === "enable-authenticator") {
          return {
            backupCodes: ["recovery-one", "recovery-two"],
            totpURI: "otpauth://totp/Otakuma?secret=ABC234&issuer=Otakuma",
          };
        }
        return {};
      }),
    );

    await workflow.enableAuthenticator("correct password");
    expect(operations).toEqual([
      "disable-authenticator",
      "enable-authenticator",
    ]);
    expect(workflow.current.authenticator).toMatchObject({
      kind: "enrolling",
      verifying: false,
    });
    expect(workflow.current.authenticatorState).toBe("pending");

    await workflow.verifyAuthenticator("123456");
    expect(workflow.current.authenticator).toEqual({
      codes: ["recovery-one", "recovery-two"],
      kind: "recovery",
    });
    expect(workflow.current.protection).toMatchObject({
      badge: "Enabled",
      tone: "ready",
    });
    workflow.acknowledgeRecoveryCodes();
    expect(workflow.current.authenticator).toEqual({
      account: "enabled",
      kind: "account",
    });
  });

  it("rolls back an optimistic passkey deletion when transport fails", async () => {
    let deleting = false;
    const workflow = new AccountSecurityWorkflow(
      { authenticatorState: "disabled", passkeyCount: 1 },
      port(async (operation) => {
        if (operation === "list-passkeys") {
          return [passkey("passkey-1", "Laptop")];
        }
        if (operation === "delete-passkey") {
          deleting = true;
          throw new Error("Delete failed");
        }
        return {};
      }),
    );
    await workflow.loadPasskeys();

    await expect(workflow.deletePasskey("passkey-1")).rejects.toThrow(
      "Delete failed",
    );

    expect(deleting).toBe(true);
    expect(workflow.current.passkeys).toEqual([passkey("passkey-1", "Laptop")]);
    expect(workflow.current.passkeyCount).toBe(1);
  });

  it("marks a saved passkey change stale when its refresh fails", async () => {
    let listCalls = 0;
    const workflow = new AccountSecurityWorkflow(
      { authenticatorState: "disabled", passkeyCount: 1 },
      port(async (operation) => {
        if (operation === "list-passkeys") {
          listCalls += 1;
          if (listCalls > 1) throw new Error("Refresh failed");
          return [passkey("passkey-1", "Laptop")];
        }
        return {};
      }),
    );
    await workflow.loadPasskeys();

    await workflow.renamePasskey("passkey-1", "Work laptop");

    expect(workflow.current.passkeys).toEqual([
      passkey("passkey-1", "Work laptop"),
    ]);
    expect(workflow.current.passkeyListState).toBe("stale");
  });

  it("owns the registration ceremony and strips extension results", async () => {
    const calls: Array<{
      readonly body?: object;
      readonly operation: AccountSecurityOperation;
    }> = [];
    let registered = false;
    const workflow = new AccountSecurityWorkflow(
      { authenticatorState: "disabled", passkeyCount: 0 },
      port(async (operation, body) => {
        calls.push({ ...(body ? { body } : {}), operation });
        if (operation === "passkey-registration-options") {
          return {
            challenge: "register-challenge",
            pubKeyCredParams: [{ alg: -7, type: "public-key" }],
            rp: { id: "example.com", name: "Otakuma Auth" },
            user: { displayName: "Member", id: "member-1", name: "Member" },
          };
        }
        if (operation === "verify-passkey-registration") registered = true;
        if (operation === "list-passkeys") {
          return registered ? [passkey("passkey-1", "Laptop")] : [];
        }
        return {};
      }),
    );

    await workflow.registerPasskey("Laptop");

    expect(calls.map(({ operation }) => operation)).toEqual([
      "passkey-registration-options",
      "verify-passkey-registration",
      "list-passkeys",
    ]);
    const verification = calls[1]?.body;
    expect(verification).toMatchObject({
      name: "Laptop",
      response: { id: "credential-1" },
    });
    expect(verification).not.toHaveProperty("response.clientExtensionResults");
    expect(workflow.current.passkeyCount).toBe(1);
  });

  it("restores enrollment after a failed verification", async () => {
    const workflow = new AccountSecurityWorkflow(
      { authenticatorState: "disabled", passkeyCount: 0 },
      port(async (operation) => {
        if (operation === "enable-authenticator") {
          return {
            backupCodes: ["recovery-one"],
            totpURI: "otpauth://totp/Otakuma?secret=ABC234&issuer=Otakuma",
          };
        }
        if (operation === "verify-authenticator") {
          throw new Error("Code expired");
        }
        return {};
      }),
    );
    await workflow.enableAuthenticator("correct password");

    await expect(workflow.verifyAuthenticator("123456")).rejects.toThrow(
      "Code expired",
    );

    expect(workflow.current.authenticator).toMatchObject({
      kind: "enrolling",
      verifying: false,
    });
    expect(workflow.finishAuthenticatorLater()).toBe(true);
    expect(workflow.current.authenticatorState).toBe("pending");
  });
});
