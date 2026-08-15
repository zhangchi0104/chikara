import { describe, expect, it } from "vitest";
import { createIdentifier, digest } from "../src/dashboard/dashboard.crypto.js";
import { DashboardError } from "../src/dashboard/dashboard.error.js";
import {
  requiredEmail,
  requiredString,
  requiredUrl,
  urlList,
} from "../src/dashboard/dashboard.input.js";

describe("auth dashboard", () => {
  it("hashes bootstrap values without retaining the input", async () => {
    const value = "chikara_bootstrap_example_value";
    const first = await digest(value);
    const second = await digest(value);

    expect(first).toBe(second);
    expect(first).not.toContain(value);
    expect(first).toMatch(/^[\w-]+$/);
  });

  it("creates prefixed random identifiers", () => {
    const first = createIdentifier("chikara_");
    const second = createIdentifier("chikara_");

    expect(first).toMatch(/^chikara_[\w-]{32}$/);
    expect(second).not.toBe(first);
  });

  it("validates dashboard input at the auth boundary", () => {
    const input = {
      identifier: "https://api.example.com",
      name: " Core API ",
      redirectUris: ["https://app.example.com/callback"],
    };

    expect(requiredString(input, "name")).toBe("Core API");
    expect(requiredUrl(input, "identifier")).toBe("https://api.example.com/");
    expect(urlList(input, "redirectUris")).toEqual([
      "https://app.example.com/callback",
    ]);
  });

  it("rejects non-http API identifiers", () => {
    expect(() =>
      requiredUrl({ identifier: "urn:chikara:api" }, "identifier"),
    ).toThrow(DashboardError);
  });

  it("accepts custom schemes for native application callbacks", () => {
    expect(
      urlList(
        {
          redirectUris: ["chikara://", "http://localhost:8081/callback"],
        },
        "redirectUris",
      ),
    ).toEqual(["chikara://", "http://localhost:8081/callback"]);
  });

  it("rejects unsafe application callbacks", () => {
    for (const redirectUri of [
      "javascript:alert(1)",
      "https://app.example.com/callback#fragment",
      "http://app.example.com/callback",
      "not a URL",
    ]) {
      expect(() =>
        urlList({ redirectUris: [redirectUri] }, "redirectUris"),
      ).toThrow(DashboardError);
    }
  });

  it("normalizes and validates email addresses", () => {
    expect(requiredEmail({ email: " Admin@Example.com " }, "email")).toBe(
      "admin@example.com",
    );
    expect(() => requiredEmail({ email: "not-an-email" }, "email")).toThrow(
      DashboardError,
    );
  });
});
