import { isTwoFactorRedirect, twoFactorLocation } from "./action-outcome.js";
import type { AuthForwarder } from "./dashboard-queries.js";
import { safeLocalPath } from "./navigation.js";

interface OperationDefinitionBase {
  readonly booleanFields?: ReadonlyArray<string>;
  readonly credential: "none" | "optional" | "required";
  readonly defaultReturn: string;
  readonly fields: ReadonlyArray<string>;
  readonly listFields?: ReadonlyArray<string>;
  readonly method: "DELETE" | "PATCH" | "POST";
}

interface StaticOperationDefinition extends OperationDefinitionBase {
  readonly path: string;
  readonly resource: "none";
}

interface ResourceOperationDefinition extends OperationDefinitionBase {
  readonly path: (resourceId: string) => string;
  readonly resource: "required";
}

type OperationDefinition =
  | ResourceOperationDefinition
  | StaticOperationDefinition;

const operations = {
  bootstrap: operation("POST", "dashboard", "/bootstrap", "/sign-in", {
    fields: ["email", "name", "password", "token"],
  }),
  "create-api": operation("POST", "dashboard", "/apis", "/apis", {
    fields: ["description", "identifier", "name"],
  }),
  "create-application": operation(
    "POST",
    "dashboard",
    "/applications",
    "/applications",
    {
      credential: "optional",
      fields: ["apiId", "name", "redirectUris", "type"],
      listFields: ["redirectUris"],
    },
  ),
  "create-user": operation("POST", "dashboard", "/users", "/users", {
    fields: ["email", "name", "password"],
  }),
  "delete-api": resourceOperation("DELETE", "/apis", "/apis"),
  "delete-application": resourceOperation(
    "DELETE",
    "/applications",
    "/applications",
  ),
  "delete-user": resourceOperation("DELETE", "/users", "/users"),
  "revoke-user-sessions": resourceOperation("POST", "/users", "/users", {
    suffix: "/revoke-sessions",
  }),
  "rotate-application": resourceOperation(
    "POST",
    "/applications",
    "/applications",
    { credential: "required", suffix: "/rotate" },
  ),
  "sign-in": operation("POST", "auth", "/sign-in/email", "/", {
    booleanFields: ["rememberMe"],
    fields: ["email", "password"],
  }),
  "sign-out": operation("POST", "auth", "/sign-out", "/sign-in"),
  "update-api": resourceOperation("PATCH", "/apis", "/apis", {
    fields: ["description", "identifier", "name"],
  }),
  "update-application": resourceOperation(
    "PATCH",
    "/applications",
    "/applications",
    {
      booleanFields: ["disabled"],
      fields: ["apiId", "name", "redirectUris"],
      listFields: ["redirectUris"],
    },
  ),
  "update-user": resourceOperation("PATCH", "/users", "/users", {
    fields: ["email", "name"],
  }),
  "verify-backup-code": operation(
    "POST",
    "auth",
    "/two-factor/verify-backup-code",
    "/",
    { fields: ["code"] },
  ),
  "verify-totp": operation("POST", "auth", "/two-factor/verify-totp", "/", {
    fields: ["code"],
  }),
} satisfies Record<string, OperationDefinition>;

export type OperationName = keyof typeof operations;

type OperationOptions = Pick<
  OperationDefinition,
  "booleanFields" | "credential" | "fields" | "listFields"
>;

interface ResourceOperationOptions extends Partial<OperationOptions> {
  readonly suffix?: string;
}

function operation(
  method: OperationDefinition["method"],
  scope: "auth" | "dashboard",
  path: string,
  defaultReturn: string,
  options: Partial<OperationOptions> = {},
): StaticOperationDefinition {
  return {
    credential: options.credential ?? "none",
    defaultReturn,
    fields: options.fields ?? [],
    method,
    path: `/api/${scope}${path}`,
    resource: "none",
    ...(options.booleanFields ? { booleanFields: options.booleanFields } : {}),
    ...(options.listFields ? { listFields: options.listFields } : {}),
  };
}

function resourceOperation(
  method: OperationDefinition["method"],
  base: string,
  defaultReturn: string,
  options: ResourceOperationOptions = {},
): ResourceOperationDefinition {
  return {
    credential: options.credential ?? "none",
    defaultReturn,
    fields: options.fields ?? [],
    method,
    path: (resourceId) =>
      `/api/dashboard${base}/${encodeURIComponent(resourceId)}${options.suffix ?? ""}`,
    resource: "required",
    ...(options.booleanFields ? { booleanFields: options.booleanFields } : {}),
    ...(options.listFields ? { listFields: options.listFields } : {}),
  };
}

export function isOperationName(value: string): value is OperationName {
  return Object.hasOwn(operations, value);
}

export interface OperationLocationOptions {
  readonly resourceId?: string;
  readonly returnTo?: string;
}

export function operationLocation(
  name: OperationName,
  options: OperationLocationOptions = {},
): string {
  const definition = operations[name];
  if (definition.resource === "required" && !options.resourceId) {
    throw new Error(`${name} requires a resource identifier.`);
  }
  if (definition.resource === "none" && options.resourceId) {
    throw new Error(`${name} does not accept a resource identifier.`);
  }
  const path = `/actions/${name}${
    options.resourceId ? `/${encodeURIComponent(options.resourceId)}` : ""
  }`;
  if (!options.returnTo) return path;
  return `${path}?${new URLSearchParams({ returnTo: options.returnTo })}`;
}

function parseOperationPath(
  path: string,
):
  | { readonly definition: OperationDefinition; readonly pathname: string }
  | undefined {
  const [name, encodedResource, extra] = path.split("/");
  if (!name || extra !== undefined || !isOperationName(name)) return undefined;
  let resourceId: string | undefined;
  try {
    resourceId = encodedResource
      ? decodeURIComponent(encodedResource)
      : undefined;
  } catch {
    return undefined;
  }
  const definition = operations[name];
  if (definition.resource === "required") {
    return resourceId
      ? { definition, pathname: definition.path(resourceId) }
      : undefined;
  }
  return resourceId ? undefined : { definition, pathname: definition.path };
}

function formBody(
  form: FormData,
  definition: OperationDefinition,
): Record<string, string | boolean | string[]> {
  const body: Record<string, string | boolean | string[]> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string" || !definition.fields.includes(key)) continue;
    body[key] = definition.listFields?.includes(key)
      ? value
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : value;
  }
  for (const key of definition.booleanFields ?? []) body[key] = form.has(key);
  return body;
}

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function credentialFrom(value: RecordValue): string | undefined {
  const credential = value.credential;
  return typeof credential === "string" && credential ? credential : undefined;
}

function operationError(value: RecordValue | undefined): string {
  if (typeof value?.error === "string") return value.error;
  if (typeof value?.message === "string") return value.message;
  return "The request could not be completed.";
}

function oneTimePage(value: string): Response {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Application created</title><body><main><h1>Store this credential now</h1><p>It will not be shown again.</p><pre>${escaped}</pre><p><a href="/applications">I have stored it</a></p></main></body></html>`,
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'",
        "Content-Type": "text/html; charset=utf-8",
        Pragma: "no-cache",
      },
    },
  );
}

function redirectWithCookies(response: Response, location: string): Response {
  const headers = new Headers({ location });
  for (const cookie of response.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { headers, status: 303 });
}

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("pragma", "no-cache");
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export interface OperationActionRequest {
  readonly forward: AuthForwarder;
  readonly path: string;
  readonly request: Request;
}

export async function handleOperationAction(
  input: OperationActionRequest,
): Promise<Response> {
  const resolved = parseOperationPath(input.path);
  if (!resolved) {
    return Response.json({ error: "Unknown operation." }, { status: 404 });
  }
  const form = await input.request.formData();
  const headers = new Headers(input.request.headers);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const response = await input.forward(
    new Request(input.request.url, {
      body: JSON.stringify(formBody(form, resolved.definition)),
      headers,
      method: resolved.definition.method,
    }),
    resolved.pathname,
  );
  if (!response.ok) return response;

  const value = record(
    await response
      .clone()
      .json()
      .catch(() => undefined),
  );
  if (!value) {
    return Response.json(
      { error: "The operation response was invalid." },
      { status: 502 },
    );
  }
  const credential = credentialFrom(value);
  if (resolved.definition.credential === "none" && credential) {
    return Response.json(
      { error: "The operation response included an unexpected credential." },
      { status: 502 },
    );
  }
  if (resolved.definition.credential === "required" && !credential) {
    return Response.json(
      { error: "The operation response did not include its credential." },
      { status: 502 },
    );
  }
  const wantsJson = input.request.headers
    .get("accept")
    ?.includes("application/json");
  if (wantsJson) return credential ? noStore(response) : response;
  if (credential) return oneTimePage(credential);

  const requestedReturn = new URL(input.request.url).searchParams.get(
    "returnTo",
  );
  const returnTo = safeLocalPath(
    requestedReturn,
    resolved.definition.defaultReturn,
  );
  if (isTwoFactorRedirect(value)) {
    const location = new URL(
      twoFactorLocation(value, returnTo),
      input.request.url,
    );
    return redirectWithCookies(response, location.toString());
  }
  return redirectWithCookies(
    response,
    new URL(returnTo, input.request.url).toString(),
  );
}

export async function operationPayload(
  response: Response,
): Promise<RecordValue> {
  const value = record(await response.json().catch(() => undefined));
  if (!response.ok) {
    throw new Error(operationError(value).slice(0, 240));
  }
  if (!value) throw new Error("The operation returned an invalid response.");
  return value;
}
