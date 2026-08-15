import { describe, expect, it } from "vitest";
import { createAuthorizationTestUrl } from "../src/lib/oauth-test.js";

describe("OAuth authorization test", () => {
  it("builds a PKCE authorization request for the Application callback", async () => {
    const value = await createAuthorizationTestUrl({
      authorizationUrl: "https://auth.example.com/api/auth/oauth2/authorize",
      clientId: "client-1",
      redirectUri: "chikara://",
    });
    const url = new URL(value);

    expect(url.origin + url.pathname).toBe(
      "https://auth.example.com/api/auth/oauth2/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "client-1",
      code_challenge_method: "S256",
      prompt: "login",
      redirect_uri: "chikara://",
      response_type: "code",
      scope: "openid profile email",
    });
    expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get("state")).toMatch(/^[\w-]{43}$/);
  });
});
