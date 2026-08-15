import type { Api, Application, Superuser, User } from "./models.js";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): ReadonlyArray<string> | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function array<T>(
  value: unknown,
  parse: (item: unknown) => T | undefined,
): ReadonlyArray<T> | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map(parse);
  return parsed.every((item): item is T => item !== undefined)
    ? parsed
    : undefined;
}

export function superuser(value: unknown): Superuser | undefined {
  const item = record(value);
  const id = string(item?.id);
  const name = string(item?.name);
  const email = string(item?.email);
  return id && name && email ? { email, id, name } : undefined;
}

function user(value: unknown): User | undefined {
  const item = record(value);
  const createdAt = item?.createdAt;
  const id = string(item?.id);
  const name = string(item?.name);
  const email = string(item?.email);
  const emailVerified = boolean(item?.emailVerified);
  const sessionCount = number(item?.sessionCount);
  if (
    !id ||
    !name ||
    !email ||
    (typeof createdAt !== "number" && typeof createdAt !== "string") ||
    emailVerified === undefined ||
    sessionCount === undefined
  ) {
    return undefined;
  }
  return { createdAt, email, emailVerified, id, name, sessionCount };
}

function api(value: unknown): Api | undefined {
  const item = record(value);
  const applicationCount = number(item?.applicationCount);
  const createdAt = number(item?.createdAt);
  const description = string(item?.description);
  const id = string(item?.id);
  const identifier = string(item?.identifier);
  const name = string(item?.name);
  const updatedAt = number(item?.updatedAt);
  if (
    applicationCount === undefined ||
    createdAt === undefined ||
    description === undefined ||
    !id ||
    !identifier ||
    !name ||
    updatedAt === undefined
  ) {
    return undefined;
  }
  return {
    applicationCount,
    createdAt,
    description,
    id,
    identifier,
    name,
    updatedAt,
  };
}

function application(value: unknown): Application | undefined {
  const item = record(value);
  const apiId = string(item?.apiId);
  const apiName = string(item?.apiName);
  const clientId = string(item?.clientId);
  const createdAt = number(item?.createdAt);
  const disabled = boolean(item?.disabled);
  const name = string(item?.name);
  const redirectUris = stringArray(item?.redirectUris);
  const type =
    item?.type === "native" || item?.type === "web" ? item.type : undefined;
  const updatedAt = number(item?.updatedAt);
  if (
    !apiId ||
    !apiName ||
    !clientId ||
    createdAt === undefined ||
    disabled === undefined ||
    !name ||
    !redirectUris ||
    !type ||
    updatedAt === undefined
  ) {
    return undefined;
  }
  return {
    apiId,
    apiName,
    clientId,
    createdAt,
    disabled,
    name,
    redirectUris,
    type,
    updatedAt,
  };
}

export function users(value: unknown): ReadonlyArray<User> | undefined {
  return array(record(value)?.users, user);
}

export function apis(value: unknown): ReadonlyArray<Api> | undefined {
  return array(record(value)?.apis, api);
}

export function applications(
  value: unknown,
): ReadonlyArray<Application> | undefined {
  return array(record(value)?.applications, application);
}

export function bootstrapStatus(value: unknown): boolean | undefined {
  return boolean(record(value)?.bootstrapped);
}

export function session(value: unknown): Superuser | undefined {
  return superuser(record(value)?.user);
}
