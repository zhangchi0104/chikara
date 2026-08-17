import { isTwoFactorRedirect, twoFactorLocation } from "./action-outcome.js";
import { safeLocalPath } from "./navigation.js";

export type ActionForwarder = (
  request: Request,
  pathname: string,
) => Promise<Response>;

const controlFields = new Set(["_boolean", "_method", "_returnTo"]);

function formBody(form: FormData): Record<string, string | boolean | string[]> {
  const body: Record<string, string | boolean | string[]> = {};
  for (const [key, value] of form.entries()) {
    if (controlFields.has(key) || typeof value !== "string") continue;
    body[key] =
      key === "redirectUris"
        ? value
            .split("\n")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : value;
  }
  for (const key of form.getAll("_boolean")) {
    if (typeof key === "string" && key.length > 0) body[key] = form.has(key);
  }
  return body;
}

function returnLocation(form: FormData): string {
  return safeLocalPath(form.get("_returnTo"), "/apis");
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

function credentialFrom(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  if (!("credential" in value)) return undefined;
  return typeof value.credential === "string" ? value.credential : undefined;
}

function redirectWithCookies(response: Response, location: string): Response {
  const redirectHeaders = new Headers({ location });
  for (const cookie of response.headers.getSetCookie()) {
    redirectHeaders.append("set-cookie", cookie);
  }
  return new Response(null, { headers: redirectHeaders, status: 303 });
}

export interface ActionRequest {
  readonly forward: ActionForwarder;
  readonly path: string;
  readonly request: Request;
  readonly scope: string;
}

export async function handleAction(input: ActionRequest): Promise<Response> {
  if (input.scope !== "auth" && input.scope !== "dashboard") {
    return Response.json({ error: "Unknown action scope." }, { status: 404 });
  }
  const form = await input.request.formData();
  const methodValue = form.get("_method");
  const method =
    methodValue === "DELETE" || methodValue === "PATCH" ? methodValue : "POST";
  const headers = new Headers(input.request.headers);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const response = await input.forward(
    new Request(input.request.url, {
      body: JSON.stringify(formBody(form)),
      headers,
      method,
    }),
    `/api/${input.scope}/${input.path}`,
  );
  const wantsJson = input.request.headers
    .get("accept")
    ?.includes("application/json");
  if (wantsJson || !response.ok) return response;

  const value: unknown = await response
    .clone()
    .json()
    .catch(() => undefined);
  const credential = credentialFrom(value);
  if (credential) return oneTimePage(credential);

  if (isTwoFactorRedirect(value)) {
    const challengeUrl = new URL(
      twoFactorLocation(value, returnLocation(form)),
      input.request.url,
    );
    return redirectWithCookies(response, challengeUrl.toString());
  }

  return redirectWithCookies(
    response,
    new URL(returnLocation(form), input.request.url).toString(),
  );
}
