import { describe, expect, it } from "vitest";
import { accountProtection } from "../src/lib/account-protection.js";

describe("account protection presentation", () => {
  it("treats a passkey as active multi-factor protection", () => {
    expect(accountProtection(1, "disabled")).toEqual({
      badge: "Enabled",
      message:
        "Your passkey protects password sign-ins and can also sign you in directly when your device verifies you.",
      tone: "ready",
    });
  });

  it("describes every active verification method", () => {
    expect(accountProtection(2, "enabled")).toEqual({
      badge: "Enabled",
      message:
        "Your passkeys and authenticator codes can verify password sign-ins.",
      tone: "ready",
    });
    expect(accountProtection(0, "enabled")).toEqual({
      badge: "Enabled",
      message: "Authenticator codes are required after password sign-in.",
      tone: "ready",
    });
  });

  it("does not call an incomplete authenticator setup protected", () => {
    expect(accountProtection(0, "pending")).toEqual({
      badge: "Not enabled",
      message:
        "Finish or reset the authenticator app setup, or add a passkey to protect password sign-ins.",
      tone: "warning",
    });
  });
});
