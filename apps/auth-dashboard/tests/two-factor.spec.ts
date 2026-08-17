import { describe, expect, it } from "vitest";
import {
  backupCodeResult,
  errorMessage,
  setupSecret,
  TwoFactorWorkflow,
  twoFactorSetup,
  twoFactorState,
} from "../src/lib/two-factor.js";

describe("two-factor browser contract", () => {
  it("accepts an enrollment response and extracts its manual setup key", () => {
    const setup = twoFactorSetup({
      backupCodes: ["one-code", "two-code"],
      totpURI:
        "otpauth://totp/Otakuma%20Auth:member@example.com?secret=ABC234&issuer=Otakuma%20Auth",
    });

    expect(setup).toEqual({
      backupCodes: ["one-code", "two-code"],
      totpURI:
        "otpauth://totp/Otakuma%20Auth:member@example.com?secret=ABC234&issuer=Otakuma%20Auth",
    });
    expect(setupSecret(setup?.totpURI ?? "")).toBe("ABC234");
  });

  it("rejects incomplete setup and non-authenticator URIs", () => {
    expect(twoFactorSetup({ totpURI: "otpauth://totp/example" })).toBeUndefined();
    expect(setupSecret("https://example.com/?secret=ABC234")).toBeUndefined();
  });

  it("reads regenerated codes and safe server errors", () => {
    expect(
      backupCodeResult({ backupCodes: ["new-code"], status: true }),
    ).toEqual(["new-code"]);
    expect(errorMessage({ message: "Invalid password" }, "Try again.")).toBe(
      "Invalid password",
    );
    expect(errorMessage({ message: 42 }, "Try again.")).toBe("Try again.");
  });

  it("owns enrollment and recovery as one workflow", () => {
    const setup = twoFactorSetup({
      backupCodes: ["one-code", "two-code"],
      totpURI:
        "otpauth://totp/Otakuma%20Auth:member@example.com?secret=ABC234&issuer=Otakuma%20Auth",
    });
    if (!setup) throw new Error("Expected a valid enrollment setup.");
    const workflow = new TwoFactorWorkflow("disabled");
    workflow.startEnrollment(setup);

    const verification = workflow.beginVerification();

    expect(workflow.finishLater()).toBe(false);
    expect(verification).toEqual(setup);
    workflow.verificationFailed();
    expect(workflow.finishLater()).toBe(true);
    expect(workflow.account).toBe("pending");
    workflow.showRecovery(["one-code"]);
    expect(workflow.current).toEqual({
      codes: ["one-code"],
      kind: "recovery",
    });
    workflow.acknowledgeRecovery();
    expect(workflow.account).toBe("enabled");
  });

  it("accepts only canonical account states", () => {
    for (const state of ["disabled", "pending", "enabled", "inconsistent"]) {
      expect(twoFactorState(state)).toBe(state);
    }
    expect(twoFactorState(true)).toBeUndefined();
  });
});
