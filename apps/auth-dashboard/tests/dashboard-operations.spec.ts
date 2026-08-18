import { describe, expect, it } from "vitest";
import {
  handleOperationAction,
  operationLocation,
  operationPayload,
} from "../src/lib/dashboard-operations.js";
import { createDashboardQueries } from "../src/lib/dashboard-queries.js";

function json(value: object, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(value), { ...init, headers });
}

describe("dashboard operations", () => {
  it("owns query paths and rejects an invalid runtime response", async () => {
    const calls: string[] = [];
    const dashboard = createDashboardQueries(async (_request, pathname) => {
      calls.push(pathname);
      if (pathname.endsWith("/status")) return json({ bootstrapped: true });
      if (pathname.endsWith("/apis")) return json({ apis: [{ id: "bad" }] });
      if (pathname.endsWith("/users")) return new Response("not json");
      return json({}, { status: 404 });
    });

    await expect(
      dashboard.bootstrapStatus(new Request("https://dashboard.example/")),
    ).resolves.toEqual({ data: true, status: 200 });
    await expect(
      dashboard.apis(new Request("https://dashboard.example/apis")),
    ).resolves.toEqual({ status: 502 });
    await expect(
      dashboard.users(new Request("https://dashboard.example/users")),
    ).resolves.toEqual({ status: 502 });
    expect(calls).toEqual([
      "/api/dashboard/status",
      "/api/dashboard/apis",
      "/api/dashboard/users",
    ]);
  });

  it("maps a named update to its method, resource and normalized body", async () => {
    let forwardedPath = "";
    let forwardedMethod = "";
    let forwardedBody: unknown;
    const response = await handleOperationAction({
      forward: async (request, pathname) => {
        forwardedPath = pathname;
        forwardedMethod = request.method;
        forwardedBody = await request.json();
        return json({ ok: true });
      },
      path: "update-application/client-1",
      request: new Request(
        "http://localhost/actions/update-application/client-1?returnTo=%2Fapplications",
        {
          body: new URLSearchParams({
            apiId: "api-1",
            disabled: "on",
            _method: "DELETE",
            name: "Web client",
            redirectUris:
              "https://app.example/callback\n\nchikara://callback",
            unexpected: "not forwarded",
          }),
          headers: { accept: "application/json" },
          method: "POST",
        },
      ),
    });

    expect(response.status).toBe(200);
    expect(forwardedPath).toBe("/api/dashboard/applications/client-1");
    expect(forwardedMethod).toBe("PATCH");
    expect(forwardedBody).toEqual({
      apiId: "api-1",
      disabled: true,
      name: "Web client",
      redirectUris: ["https://app.example/callback", "chikara://callback"],
    });
  });

  it("derives unchecked booleans from the operation contract", async () => {
    let forwardedBody: unknown;
    await handleOperationAction({
      forward: async (request) => {
        forwardedBody = await request.json();
        return json({ ok: true });
      },
      path: "update-application/client-1",
      request: new Request("http://localhost/actions/update-application/client-1", {
        body: new URLSearchParams({
          apiId: "api-1",
          name: "Web client",
          redirectUris: "https://app.example/callback",
        }),
        headers: { accept: "application/json" },
        method: "POST",
      }),
    });

    expect(forwardedBody).toMatchObject({ disabled: false });
  });

  it("preserves auth cookies while redirecting through a two-factor challenge", async () => {
    const response = await handleOperationAction({
      forward: async () =>
        json(
          { twoFactorMethods: ["totp"], twoFactorRedirect: true },
          { headers: { "set-cookie": "session=pending; Path=/; HttpOnly" } },
        ),
      path: "sign-in",
      request: new Request(
        "http://localhost/actions/sign-in?returnTo=%2Fprofile%3Fsource%3Dsign-in",
        {
          body: new URLSearchParams({
            email: "member@example.com",
            password: "example password",
            rememberMe: "on",
          }),
          method: "POST",
        },
      ),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/two-factor?returnTo=%2Fprofile%3Fsource%3Dsign-in&method=totp",
    );
    expect(response.headers.get("set-cookie")).toContain("session=pending");
  });

  it("shows a credential once without putting it in a redirect", async () => {
    const response = await handleOperationAction({
      forward: async () => json({ credential: "temporary-value" }),
      path: "rotate-application/client-1",
      request: new Request(
        "http://localhost/actions/rotate-application/client-1",
        { body: new URLSearchParams(), method: "POST" },
      ),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toContain("temporary-value");

    const enhanced = await handleOperationAction({
      forward: async () => json({ credential: "temporary-value" }),
      path: "rotate-application/client-1",
      request: new Request(
        "http://localhost/actions/rotate-application/client-1",
        {
          body: new URLSearchParams(),
          headers: { accept: "application/json" },
          method: "POST",
        },
      ),
    });
    expect(enhanced.headers.get("cache-control")).toBe("no-store");
    expect(await enhanced.json()).toEqual({ credential: "temporary-value" });
  });

  it("rejects a credential from an operation that cannot issue one", async () => {
    const response = await handleOperationAction({
      forward: async () => json({ credential: "unexpected-value" }),
      path: "sign-out",
      request: new Request("http://localhost/actions/sign-out", {
        body: new URLSearchParams(),
        headers: { accept: "application/json" },
        method: "POST",
      }),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The operation response included an unexpected credential.",
    });
  });

  it("rejects unknown or incomplete operation identities", async () => {
    for (const path of ["unknown", "update-api", "bootstrap/extra"]) {
      const response = await handleOperationAction({
        forward: async () => json({ ok: true }),
        path,
        request: new Request(`http://localhost/actions/${path}`, {
          body: new URLSearchParams(),
          method: "POST",
        }),
      });
      expect(response.status).toBe(404);
    }
  });

  it("generates action locations and maps browser errors consistently", async () => {
    expect(
      operationLocation("update-api", {
        resourceId: "api/with/slash",
        returnTo: "/apis?selected=api-1",
      }),
    ).toBe(
      "/actions/update-api/api%2Fwith%2Fslash?returnTo=%2Fapis%3Fselected%3Dapi-1",
    );
    expect(() =>
      operationLocation("bootstrap", { resourceId: "unexpected" }),
    ).toThrow("does not accept a resource identifier");
    await expect(
      operationPayload(json({ error: "API not found." }, { status: 404 })),
    ).rejects.toThrow("API not found.");
    await expect(
      operationPayload(new Response("not json")),
    ).rejects.toThrow("invalid response");
  });
});
