import { env } from "cloudflare:workers";
import {
  accountSession,
  apis,
  applications,
  bootstrapStatus,
  oauthEndpoints,
  users,
} from "./contract.js";
import type {
  AccountSession,
  Api,
  Application,
  OauthEndpoints,
  User,
} from "./models.js";

export async function forwardToAuth(
  request: Request,
  pathname: string,
): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = new URL(request.url).search;
  return env.AUTH.fetch(new Request(url, request));
}

async function managementGet<T>(
  request: Request,
  pathname: string,
  decode: (value: unknown) => T | undefined,
): Promise<{ readonly data?: T; readonly status: number }> {
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  const response = await forwardToAuth(
    new Request(request.url, { headers, method: "GET" }),
    `/api/dashboard${pathname}`,
  );
  if (!response.ok) return { status: response.status };
  const data = decode(await response.json());
  return data === undefined
    ? { status: 502 }
    : { data, status: response.status };
}

export const getBootstrapStatus = (request: Request) =>
  managementGet(request, "/status", bootstrapStatus);

export const getAccountSession = (request: Request) =>
  managementGet<AccountSession>(request, "/session", accountSession);

export const getUsers = (request: Request) =>
  managementGet<ReadonlyArray<User>>(request, "/users", users);

export const getApis = (request: Request) =>
  managementGet<ReadonlyArray<Api>>(request, "/apis", apis);

export const getApplications = (request: Request) =>
  managementGet<ReadonlyArray<Application>>(
    request,
    "/applications",
    applications,
  );

export async function getOauthEndpoints(
  request: Request,
): Promise<{ readonly data?: OauthEndpoints; readonly status: number }> {
  const url = new URL(request.url);
  url.search = "";
  const response = await forwardToAuth(
    new Request(url, { headers: request.headers, method: "GET" }),
    "/.well-known/oauth-authorization-server/api/auth",
  );
  if (!response.ok) return { status: response.status };
  const data = oauthEndpoints(await response.json());
  return data === undefined
    ? { status: 502 }
    : { data, status: response.status };
}
