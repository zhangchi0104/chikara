import { Effect } from "effect";
import { runtimePromise } from "../auth-runtime.effect.js";

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function digest(value: string) {
  return runtimePromise("hash dashboard value", () =>
    crypto.subtle.digest("SHA-256", encoder.encode(value)),
  ).pipe(Effect.map((result) => bytesToBase64Url(new Uint8Array(result))));
}

export function createIdentifier(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `${prefix}${bytesToBase64Url(bytes)}`;
}
