import { describe, expect, it } from "vitest";
import {
  accountSession,
  applications,
  bootstrapStatus,
  oauthEndpoints,
  userDetail,
} from "../src/lib/contract.js";

describe("dashboard transport contract", () => {
  it("reads a signed-in account and its server-derived access", () => {
    expect(
      accountSession({
        canManage: false,
        user: {
          createdAt: "2026-08-16T00:00:00.000Z",
          email: "member@example.com",
          emailVerified: true,
          id: "user-1",
          image: null,
          name: "Member",
          passkeyCount: 1,
          twoFactorState: "disabled",
        },
      }),
    ).toEqual({
      canManage: false,
      user: {
        createdAt: "2026-08-16T00:00:00.000Z",
        email: "member@example.com",
        emailVerified: true,
        id: "user-1",
        image: null,
        name: "Member",
        passkeyCount: 1,
        twoFactorState: "disabled",
      },
    });
    expect(
      accountSession({
        canManage: false,
        user: {
          email: "member@example.com",
          id: "user-1",
          name: "Member",
        },
      }),
    ).toBeUndefined();
    expect(
      accountSession({
        canManage: false,
        user: {
          createdAt: "2026-08-16T00:00:00.000Z",
          email: "member@example.com",
          emailVerified: true,
          id: "user-1",
          image: null,
          name: "Member",
          passkeyCount: -1,
          twoFactorState: "disabled",
        },
      }),
    ).toBeUndefined();
  });

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

  it("accepts a bounded administrator view of user activity", () => {
    expect(
      userDetail({
        activity: {
          events: [
            {
              actorName: "Admin",
              actorUserId: "admin-1",
              eventType: "account.provisioned",
              id: "event-1",
              occurredAt: 1,
            },
          ],
          nextCursor: { id: "event-1", occurredAt: 1 },
        },
        user: {
          administrator: false,
          createdAt: 1,
          email: "member@example.com",
          emailVerified: true,
          id: "user-1",
          image: null,
          name: "Member",
          sessionCount: 2,
        },
      }),
    ).toMatchObject({
      activity: {
        events: [{ eventType: "account.provisioned" }],
      },
      user: { email: "member@example.com" },
    });
    expect(
      userDetail({
        activity: {
          events: [
            {
              actorName: null,
              actorUserId: null,
              eventType: "password.exposed",
              id: "event-1",
              occurredAt: 1,
            },
          ],
          nextCursor: null,
        },
        user: {},
      }),
    ).toBeUndefined();
  });
});
