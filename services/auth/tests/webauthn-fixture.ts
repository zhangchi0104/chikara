import { Buffer } from "node:buffer";

function concat(...values: ReadonlyArray<Uint8Array>): Uint8Array {
  const length = values.reduce((total, value) => total + value.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function base64url(value: BufferSource): string {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.from(bytes).toString("base64url");
}

function derInteger(value: Uint8Array): Uint8Array {
  let offset = 0;
  while (
    offset < value.length - 1 &&
    value[offset] === 0 &&
    (value[offset + 1] ?? 0) < 0x80
  ) {
    offset += 1;
  }
  const significant = value.slice(offset);
  const prefixed = (significant[0] ?? 0) >= 0x80;
  return Uint8Array.from([
    0x02,
    significant.length + (prefixed ? 1 : 0),
    ...(prefixed ? [0] : []),
    ...significant,
  ]);
}

function derSignature(raw: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(raw);
  if (bytes.length !== 64) {
    throw new Error("The test authenticator returned an invalid signature.");
  }
  const r = derInteger(bytes.slice(0, 32));
  const s = derInteger(bytes.slice(32));
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
}

function cosePublicKey(x: Uint8Array, y: Uint8Array): Uint8Array {
  if (x.length !== 32 || y.length !== 32) {
    throw new Error("The test authenticator did not use a P-256 public key.");
  }
  return Uint8Array.from([
    0xa5,
    0x01,
    0x02,
    0x03,
    0x26,
    0x20,
    0x01,
    0x21,
    0x58,
    0x20,
    ...x,
    0x22,
    0x58,
    0x20,
    ...y,
  ]);
}

export interface AuthenticationFixtureInput {
  readonly challenge: string;
  readonly origin: string;
  readonly rpId: string;
  readonly userVerified?: boolean;
}

export interface TestPasskey {
  readonly credentialId: string;
  readonly publicKey: string;
  authenticationResponse(input: AuthenticationFixtureInput): Promise<object>;
}

export async function createTestPasskey(): Promise<TestPasskey> {
  const generated = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  if (!("publicKey" in generated)) {
    throw new Error("The test authenticator did not create a key pair.");
  }
  const keyPair = generated;
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  if (jwk instanceof ArrayBuffer || !jwk.x || !jwk.y) {
    throw new Error("The test authenticator public key was incomplete.");
  }
  const credentialId = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const publicKey = Buffer.from(
    cosePublicKey(
      Buffer.from(jwk.x, "base64url"),
      Buffer.from(jwk.y, "base64url"),
    ),
  ).toString("base64");

  return {
    credentialId,
    publicKey,
    async authenticationResponse(input) {
      const clientDataJSON = new TextEncoder().encode(
        JSON.stringify({
          challenge: input.challenge,
          crossOrigin: false,
          origin: input.origin,
          type: "webauthn.get",
        }),
      );
      const rpIdHash = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(input.rpId),
        ),
      );
      const flags = input.userVerified === false ? 0x01 : 0x05;
      const authenticatorData = concat(
        rpIdHash,
        Uint8Array.from([flags, 0, 0, 0, 1]),
      );
      const clientDataHash = new Uint8Array(
        await crypto.subtle.digest("SHA-256", clientDataJSON),
      );
      const rawSignature = await crypto.subtle.sign(
        { hash: "SHA-256", name: "ECDSA" },
        keyPair.privateKey,
        concat(authenticatorData, clientDataHash),
      );

      return {
        authenticatorAttachment: "platform",
        clientExtensionResults: {},
        id: credentialId,
        rawId: credentialId,
        response: {
          authenticatorData: base64url(authenticatorData),
          clientDataJSON: base64url(clientDataJSON),
          signature: base64url(derSignature(rawSignature)),
          userHandle: null,
        },
        type: "public-key",
      };
    },
  };
}
