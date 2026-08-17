import { describe, expect, it } from "vitest";
import { handleAction } from "../src/lib/action.js";
import { enhancedActionLocation } from "../src/lib/action-outcome.js";

describe("dashboard server actions", () => {
  it("routes enhanced sign-ins through the two-factor challenge", () => {
    expect(
      enhancedActionLocation(
        { twoFactorMethods: ["totp"], twoFactorRedirect: true },
        "/profile?source=sign-in",
        "/sign-in",
      ),
    ).toBe(
      "/two-factor?returnTo=%2Fprofile%3Fsource%3Dsign-in",
    );
    expect(
      enhancedActionLocation({ ok: true }, "/profile", "/sign-in"),
    ).toBe("/profile");
    expect(
      enhancedActionLocation({ ok: true }, "//evil.example", "/sign-in"),
    ).toBe("/sign-in");
  });

  it("translates enhanced forms into typed management requests", async () => {
    let forwardedMethod = "";
    let forwardedPath = "";
    let forwardedBody: unknown;
    const response = await handleAction({
      forward: async (request, pathname) => {
        forwardedMethod = request.method;
        forwardedPath = pathname;
        forwardedBody = await request.json();
        return Response.json({ ok: true });
      },
      path: "applications/client-1",
      request: new Request("http://localhost/actions/dashboard/applications", {
        body: new URLSearchParams({
          _method: "PATCH",
          _returnTo: "/applications",
          _boolean: "disabled",
          apiId: "api-1",
          disabled: "on",
          name: "Web",
          redirectUris:
            "https://app.example.com/callback\nhttps://app.example.com/return",
        }),
        headers: { accept: "application/json" },
        method: "POST",
      }),
      scope: "dashboard",
    });

    expect(response.status).toBe(200);
    expect(forwardedMethod).toBe("PATCH");
    expect(forwardedPath).toBe(
      "/api/dashboard/applications/client-1",
    );
    expect(forwardedBody).toEqual({
      apiId: "api-1",
      disabled: true,
      name: "Web",
      redirectUris: [
        "https://app.example.com/callback",
        "https://app.example.com/return",
      ],
    });
  });

  it("preserves auth response cookies across native redirects", async () => {
    const response = await handleAction({
      forward: () =>
        Promise.resolve(
          Response.json(
            { ok: true },
            { headers: { "set-cookie": "session=updated; HttpOnly" } },
          ),
        ),
      path: "sign-out",
      request: new Request("http://localhost/actions/auth/sign-out", {
        body: new URLSearchParams({ _returnTo: "/sign-in" }),
        method: "POST",
      }),
      scope: "auth",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/sign-in");
    expect(response.headers.get("set-cookie")).toContain("session=updated");
  });

  it("rejects protocol-relative return locations", async () => {
    const response = await handleAction({
      forward: () => Promise.resolve(Response.json({ ok: true })),
      path: "sign-out",
      request: new Request("http://localhost/actions/auth/sign-out", {
        body: new URLSearchParams({ _returnTo: "//evil.example" }),
        method: "POST",
      }),
      scope: "auth",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/apis");
  });

  it("hands a two-factor challenge to the verification page", async () => {
    const response = await handleAction({
      forward: () =>
        Promise.resolve(
          Response.json(
            { twoFactorMethods: ["totp"], twoFactorRedirect: true },
            { headers: { "set-cookie": "two-factor=challenge; HttpOnly" } },
          ),
        ),
      path: "sign-in/email",
      request: new Request("http://localhost/actions/auth/sign-in/email", {
        body: new URLSearchParams({ _returnTo: "/apis" }),
        method: "POST",
      }),
      scope: "auth",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/two-factor?returnTo=%2Fapis",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "two-factor=challenge",
    );
  });

  it("renders a no-store one-time response for a new credential", async () => {
    const response = await handleAction({
      forward: () =>
        Promise.resolve(Response.json({ credential: "temporary-value" })),
      path: "applications",
      request: new Request("http://localhost/actions/dashboard/applications", {
        body: new URLSearchParams({ name: "Web" }),
        method: "POST",
      }),
      scope: "dashboard",
    });

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("temporary-value");
  });
});
