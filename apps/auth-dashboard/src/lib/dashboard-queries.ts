import { twoFactorMethods } from "./action-outcome.js";
import {
  accountSession,
  apis,
  applications,
  bootstrapStatus,
  oauthEndpoints,
  userDetail,
  users,
} from "./contract.js";

export type AuthForwarder = (
  request: Request,
  pathname: string,
) => Promise<Response>;

async function read<T>(
  forward: AuthForwarder,
  request: Request,
  pathname: string,
  decode: (value: unknown) => T | undefined,
): Promise<{ readonly data?: T; readonly status: number }> {
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  const response = await forward(
    new Request(request.url, { headers, method: "GET" }),
    pathname,
  );
  if (!response.ok) return { status: response.status };
  const data = decode(await response.json().catch(() => undefined));
  return data === undefined
    ? { status: 502 }
    : { data, status: response.status };
}

export function createDashboardQueries(forward: AuthForwarder) {
  return {
    accountSession: (request: Request) =>
      read(forward, request, "/api/dashboard/session", accountSession),
    apis: (request: Request) =>
      read(forward, request, "/api/dashboard/apis", apis),
    applications: (request: Request) =>
      read(forward, request, "/api/dashboard/applications", applications),
    bootstrapStatus: (request: Request) =>
      read(forward, request, "/api/dashboard/status", bootstrapStatus),
    oauthEndpoints: (request: Request) =>
      read(
        forward,
        new Request(new URL(request.url).origin, {
          headers: request.headers,
          method: "GET",
        }),
        "/.well-known/oauth-authorization-server/api/auth",
        oauthEndpoints,
      ),
    twoFactorChallenge: async (request: Request) => {
      const response = await forward(request, "/api/auth/two-factor/methods");
      if (!response.ok) return { status: response.status };
      const methods = twoFactorMethods(
        await response.json().catch(() => undefined),
      );
      return methods.length > 0
        ? { data: methods, status: response.status }
        : { status: 502 };
    },
    userDetail: (request: Request, userId: string) =>
      read(
        forward,
        request,
        `/api/dashboard/users/${encodeURIComponent(userId)}`,
        userDetail,
      ),
    users: (request: Request) =>
      read(forward, request, "/api/dashboard/users", users),
  };
}
