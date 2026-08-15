import { describe, expect, it } from "vitest";
import {
  applications,
  bootstrapStatus,
  oauthEndpoints,
  session,
} from "../src/lib/contract.js";

describe("dashboard transport contract", () => {
  it("accepts the shared Application representation", () => {
    expect(
      applications({
        applications: [
          {
            apiId: "api-1",
            apiName: "Core API",
            clientId: "client-1",
            createdAt: 1,
            disabled: false,
            name: "Web",
            redirectUris: ["https://app.example.com/callback"],
            type: "web",
            updatedAt: 2,
          },
        ],
      }),
    ).toHaveLength(1);
  });

  it("rejects drifted or incomplete responses", () => {
    expect(
      applications({
        applications: [
          {
            apiId: "api-1",
            clientId: "client-1",
            type: "service",
          },
        ],
      }),
    ).toBeUndefined();
    expect(session({ user: { id: "user-1" } })).toBeUndefined();
    expect(bootstrapStatus({ bootstrapped: "yes" })).toBeUndefined();
  });

  it("reads the public OAuth endpoints from discovery metadata", () => {
    expect(
      oauthEndpoints({
        authorization_endpoint:
          "https://auth.example.com/api/auth/oauth2/authorize",
        token_endpoint: "https://auth.example.com/api/auth/oauth2/token",
      }),
    ).toEqual({
      authorizationUrl: "https://auth.example.com/api/auth/oauth2/authorize",
      tokenUrl: "https://auth.example.com/api/auth/oauth2/token",
    });
    expect(
      oauthEndpoints({ authorization_endpoint: "https://auth.example.com" }),
    ).toBeUndefined();
  });
});
