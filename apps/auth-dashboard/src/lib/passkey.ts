import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function isAuthenticationOptions(
  value: unknown,
): value is PublicKeyCredentialRequestOptionsJSON {
  const item = record(value);
  return typeof item?.challenge === "string";
}

export function authenticationOptions(
  value: unknown,
): PublicKeyCredentialRequestOptionsJSON | undefined {
  return isAuthenticationOptions(value) ? value : undefined;
}

export function secondFactorAuthenticationOptions(
  value: unknown,
): PublicKeyCredentialRequestOptionsJSON | undefined {
  if (!isAuthenticationOptions(value)) return undefined;
  const item = record(value);
  if (
    !Array.isArray(item?.allowCredentials) ||
    item.allowCredentials.length === 0 ||
    !item.allowCredentials.every((credential) => {
      const descriptor = record(credential);
      return (
        typeof descriptor?.id === "string" && descriptor.type === "public-key"
      );
    })
  ) {
    return undefined;
  }
  return value;
}

function isRegistrationOptions(
  value: unknown,
): value is PublicKeyCredentialCreationOptionsJSON {
  const item = record(value);
  const relyingParty = record(item?.rp);
  const user = record(item?.user);
  return !(
    typeof item?.challenge !== "string" ||
    !Array.isArray(item.pubKeyCredParams) ||
    typeof relyingParty?.name !== "string" ||
    typeof user?.id !== "string" ||
    typeof user.name !== "string" ||
    typeof user.displayName !== "string"
  );
}

export function registrationOptions(
  value: unknown,
): PublicKeyCredentialCreationOptionsJSON | undefined {
  return isRegistrationOptions(value) ? value : undefined;
}

export interface PasskeySummary {
  readonly backedUp: boolean;
  readonly createdAt: number | string;
  readonly deviceType: string;
  readonly id: string;
  readonly name?: string;
}

function passkey(value: unknown): PasskeySummary | undefined {
  const item = record(value);
  const createdAt = item?.createdAt;
  const name = item?.name;
  if (
    typeof item?.id !== "string" ||
    typeof item.deviceType !== "string" ||
    typeof item.backedUp !== "boolean" ||
    (typeof createdAt !== "number" && typeof createdAt !== "string") ||
    (name !== undefined && name !== null && typeof name !== "string")
  ) {
    return undefined;
  }
  return {
    backedUp: item.backedUp,
    createdAt,
    deviceType: item.deviceType,
    id: item.id,
    ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
  };
}

export function passkeyList(
  value: unknown,
): ReadonlyArray<PasskeySummary> | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map(passkey);
  return parsed.every((item): item is PasskeySummary => item !== undefined)
    ? parsed
    : undefined;
}

export function passkeyError(value: unknown, fallback: string): string {
  const item = record(value);
  const nested = record(item?.error);
  const message =
    typeof item?.message === "string"
      ? item.message
      : typeof nested?.message === "string"
        ? nested.message
        : typeof item?.error === "string"
          ? item.error
          : undefined;
  return message?.trim().slice(0, 240) || fallback;
}

export function authenticationResponseBody(
  response: AuthenticationResponseJSON,
): Omit<AuthenticationResponseJSON, "clientExtensionResults"> {
  const { clientExtensionResults: _clientExtensionResults, ...body } = response;
  return body;
}

export function registrationResponseBody(
  response: RegistrationResponseJSON,
): Omit<RegistrationResponseJSON, "clientExtensionResults"> {
  const { clientExtensionResults: _clientExtensionResults, ...body } = response;
  return body;
}
