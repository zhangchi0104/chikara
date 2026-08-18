import { Effect } from "effect";

export type PublicAuthForwarder = (
  request: Request,
) => Effect.Effect<Response, Error>;

interface PublicPageAction {
  readonly forward: PublicAuthForwarder;
  readonly request: Request;
}

type TwoFactorMethod = "totp" | "recovery";

interface TwoFactorRedirect {
  readonly twoFactorMethods?: unknown;
  readonly twoFactorRedirect: true;
}

function errorResponse(message: string, status = 400): Response {
  return Response.json({ message }, { status });
}

function readForm(request: Request) {
  return Effect.tryPromise({
    catch: () => errorResponse("The submitted form could not be read."),
    try: () => request.formData(),
  }).pipe(Effect.catch(Effect.succeed));
}

function formString(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function signedOAuthQuery(
  searchParams: URLSearchParams,
): string | undefined {
  const signedParameterNames = new Set(searchParams.getAll("ba_param"));
  if (!searchParams.has("sig") || signedParameterNames.size === 0) {
    return undefined;
  }

  const signedQuery = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    if (key === "sig" || key === "ba_param" || signedParameterNames.has(key)) {
      signedQuery.append(key, value);
    }
  }
  return signedQuery.toString();
}

function appendOAuthQuery(
  body: Record<string, boolean | string>,
  request: Request,
): void {
  const oauthQuery = signedOAuthQuery(new URL(request.url).searchParams);
  if (oauthQuery) body.oauth_query = oauthQuery;
}

function authRequest(
  request: Request,
  pathname: string,
  body: Record<string, boolean | string>,
): Request {
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  return new Request(new URL(pathname, request.url), {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

function redirectUrl(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("url" in payload)) {
    return undefined;
  }
  return typeof payload.url === "string" ? payload.url : undefined;
}

function requiresTwoFactor(payload: unknown): payload is TwoFactorRedirect {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "twoFactorRedirect" in payload &&
    payload.twoFactorRedirect === true
  );
}

export function challengeMethods(
  payload: unknown,
): ReadonlyArray<"passkey" | "totp"> {
  if (
    !requiresTwoFactor(payload) ||
    !("twoFactorMethods" in payload) ||
    !Array.isArray(payload.twoFactorMethods)
  ) {
    return [];
  }
  return payload.twoFactorMethods.filter(
    (method): method is "passkey" | "totp" =>
      method === "passkey" || method === "totp",
  );
}

function responsePayload(response: Response) {
  return Effect.tryPromise({
    catch: () => undefined,
    try: () => response.clone().json(),
  }).pipe(Effect.orElseSucceed(() => undefined));
}

export function redirectWithCookies(
  response: Response,
  location: string,
): Response {
  const headers = new Headers({ location });
  for (const cookie of response.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { headers, status: 303 });
}

function sameOriginLocation(request: Request, pathname: string): string {
  return new URL(pathname, request.url).toString();
}

function twoFactorLocation(request: Request, payload: unknown): string {
  const url = new URL("/two-factor", request.url);
  const oauthQuery = signedOAuthQuery(new URL(request.url).searchParams);
  url.search = oauthQuery ?? "";
  for (const method of challengeMethods(payload)) {
    url.searchParams.append("method", method);
  }
  return url.toString();
}

export function handleSignInPageAction(action: PublicPageAction) {
  return Effect.gen(function* () {
    const form = yield* readForm(action.request);
    if (form instanceof Response) return form;
    const email = formString(form, "email");
    const password = formString(form, "password");
    if (!email || !password) {
      return errorResponse("Email and password are required.");
    }

    const body: Record<string, boolean | string> = {
      email,
      password,
      rememberMe: true,
    };
    appendOAuthQuery(body, action.request);
    const response = yield* action.forward(
      authRequest(action.request, "/api/auth/sign-in/email", body),
    );
    if (!response.ok) return response;

    const payload = yield* responsePayload(response);
    const location = requiresTwoFactor(payload)
      ? twoFactorLocation(action.request, payload)
      : (redirectUrl(payload) ?? sameOriginLocation(action.request, "/"));
    return redirectWithCookies(response, location);
  });
}

function twoFactorEndpoint(method: TwoFactorMethod): string {
  return method === "totp"
    ? "/api/auth/two-factor/verify-totp"
    : "/api/auth/two-factor/verify-backup-code";
}

export function handleTwoFactorPageAction(action: PublicPageAction) {
  return Effect.gen(function* () {
    const form = yield* readForm(action.request);
    if (form instanceof Response) return form;
    const method = formString(form, "factor");
    const code = formString(form, "code")?.trim();
    if ((method !== "totp" && method !== "recovery") || !code) {
      return errorResponse("A valid two-factor method and code are required.");
    }

    const body: Record<string, boolean | string> = { code };
    appendOAuthQuery(body, action.request);
    const response = yield* action.forward(
      authRequest(action.request, twoFactorEndpoint(method), body),
    );
    if (!response.ok) return response;

    const payload = yield* responsePayload(response);
    const location =
      redirectUrl(payload) ?? sameOriginLocation(action.request, "/");
    return redirectWithCookies(response, location);
  });
}
