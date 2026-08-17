import { describe, expect, it } from "vitest";
import {
  authenticationOptions,
  authenticationResponseBody,
  passkeyError,
  passkeyList,
  registrationOptions,
  secondFactorAuthenticationOptions,
} from "../src/lib/passkey.js";

describe("passkey browser contract", () => {
  it("accepts the two WebAuthn option shapes", () => {
    expect(authenticationOptions({ challenge: "auth-challenge" })).toEqual({
      challenge: "auth-challenge",
    });
    expect(
      registrationOptions({
        challenge: "register-challenge",
        pubKeyCredParams: [{ alg: -7, type: "public-key" }],
        rp: { id: "example.com", name: "Otakuma Auth" },
        user: { displayName: "Member", id: "member-1", name: "Member" },
      }),
    ).toMatchObject({ challenge: "register-challenge" });
    expect(authenticationOptions({})).toBeUndefined();
    expect(
      secondFactorAuthenticationOptions({
        allowCredentials: [{ id: "credential-1", type: "public-key" }],
        challenge: "step-up-challenge",
      }),
    ).toMatchObject({ challenge: "step-up-challenge" });
    expect(
      secondFactorAuthenticationOptions({
        allowCredentials: [],
        challenge: "unbound-challenge",
      }),
    ).toBeUndefined();
    expect(
      secondFactorAuthenticationOptions({ challenge: "discoverable" }),
    ).toBeUndefined();
    expect(registrationOptions({ challenge: "incomplete" })).toBeUndefined();
  });

  it("keeps only safe passkey fields for display", () => {
    expect(
      passkeyList([
        {
          backedUp: true,
          createdAt: "2026-08-16T00:00:00.000Z",
          credentialID: "private-credential-id",
          deviceType: "multiDevice",
          id: "passkey-1",
          name: "  Password manager  ",
          publicKey: "private-public-key-material",
        },
      ]),
    ).toEqual([
      {
        backedUp: true,
        createdAt: "2026-08-16T00:00:00.000Z",
        deviceType: "multiDevice",
        id: "passkey-1",
        name: "Password manager",
      },
    ]);
    expect(passkeyList([{ id: "incomplete" }])).toBeUndefined();
  });

  it("removes extension results before verification", () => {
    const body = authenticationResponseBody({
      clientExtensionResults: { appid: true },
      id: "credential",
      rawId: "credential",
      response: {
        authenticatorData: "authenticator-data",
        clientDataJSON: "client-data",
        signature: "signature",
      },
      type: "public-key",
    });

    expect(body).not.toHaveProperty("clientExtensionResults");
    expect(body.id).toBe("credential");
  });

  it("reads bounded Better Auth errors", () => {
    expect(
      passkeyError({ error: { message: "Challenge expired" } }, "Try again."),
    ).toBe("Challenge expired");
    expect(passkeyError({}, "Try again.")).toBe("Try again.");
  });
});
