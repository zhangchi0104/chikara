import { authEventTypes } from "@chikara/auth/dashboard-contract";
import type {
  AccountProfile,
  AccountSession,
  Api,
  Application,
  OauthEndpoints,
  User,
  UserActivity,
  UserActivityCursor,
  UserActivityPage,
  UserActivityType,
  UserDetail,
  UserProfile,
} from "./models.js";
import { twoFactorState } from "./two-factor.js";

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

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : string(value);
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

function accountProfile(value: unknown): AccountProfile | undefined {
  const item = record(value);
  const createdAt = string(item?.createdAt);
  const email = string(item?.email);
  const emailVerified = boolean(item?.emailVerified);
  const id = string(item?.id);
  const image = nullableString(item?.image);
  const name = string(item?.name);
  const passkeyCount = nonNegativeInteger(item?.passkeyCount);
  const state = twoFactorState(item?.twoFactorState);
  if (
    !createdAt ||
    !email ||
    emailVerified === undefined ||
    !id ||
    image === undefined ||
    !name ||
    passkeyCount === undefined ||
    !state
  ) {
    return undefined;
  }
  return {
    createdAt,
    email,
    emailVerified,
    id,
    image,
    name,
    passkeyCount,
    twoFactorState: state,
  };
}

export function accountSession(value: unknown): AccountSession | undefined {
  const item = record(value);
  const canManage = boolean(item?.canManage);
  const user = accountProfile(item?.user);
  return canManage === undefined || !user ? undefined : { canManage, user };
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

const authEventTypeSet = new Set<string>(authEventTypes);

function userActivityType(value: unknown): UserActivityType | undefined {
  return typeof value === "string" && authEventTypeSet.has(value)
    ? (value as UserActivityType)
    : undefined;
}

function userActivity(value: unknown): UserActivity | undefined {
  const item = record(value);
  const actorName = nullableString(item?.actorName);
  const actorUserId = nullableString(item?.actorUserId);
  const eventType = userActivityType(item?.eventType);
  const id = string(item?.id);
  const occurredAt = number(item?.occurredAt);
  if (
    actorName === undefined ||
    actorUserId === undefined ||
    !eventType ||
    !id ||
    occurredAt === undefined
  ) {
    return undefined;
  }
  return { actorName, actorUserId, eventType, id, occurredAt };
}

function userActivityCursor(value: unknown): UserActivityCursor | undefined {
  const item = record(value);
  const id = string(item?.id);
  const occurredAt = number(item?.occurredAt);
  return id && occurredAt !== undefined ? { id, occurredAt } : undefined;
}

function userActivityPage(value: unknown): UserActivityPage | undefined {
  const item = record(value);
  const events = array(item?.events, userActivity);
  const nextCursor =
    item?.nextCursor === null ? null : userActivityCursor(item?.nextCursor);
  return events && nextCursor !== undefined
    ? { events, nextCursor }
    : undefined;
}

function userProfile(value: unknown): UserProfile | undefined {
  const item = record(value);
  const base = user(value);
  const administrator = boolean(item?.administrator);
  const image = nullableString(item?.image);
  return base && administrator !== undefined && image !== undefined
    ? { ...base, administrator, image }
    : undefined;
}

export function userDetail(value: unknown): UserDetail | undefined {
  const item = record(value);
  const activity = userActivityPage(item?.activity);
  const profile = userProfile(item?.user);
  return activity && profile ? { activity, user: profile } : undefined;
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

export function oauthEndpoints(value: unknown): OauthEndpoints | undefined {
  const item = record(value);
  const authorizationUrl = string(item?.authorization_endpoint);
  const tokenUrl = string(item?.token_endpoint);
  return authorizationUrl && tokenUrl
    ? { authorizationUrl, tokenUrl }
    : undefined;
}
