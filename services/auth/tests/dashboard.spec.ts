import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createIdentifier, digest } from "../src/dashboard/dashboard.crypto.js";
import { DashboardError } from "../src/dashboard/dashboard.error.js";
import {
  requiredEmail,
  requiredString,
  requiredUrl,
  urlList,
} from "../src/dashboard/dashboard.input.js";

describe("auth dashboard", () => {
  it.effect("hashes bootstrap values without retaining the input", () =>
    Effect.gen(function* () {
      const value = "chikara_bootstrap_example_value";
      const first = yield* digest(value);
      const second = yield* digest(value);

      expect(first).toBe(second);
      expect(first).not.toContain(value);
      expect(first).toMatch(/^[\w-]+$/);
    }),
  );

  it("creates prefixed random identifiers", () => {
    const first = createIdentifier("chikara_");
    const second = createIdentifier("chikara_");

    expect(first).toMatch(/^chikara_[\w-]{32}$/);
    expect(second).not.toBe(first);
  });

  it.effect("validates dashboard input at the auth boundary", () =>
    Effect.gen(function* () {
      const input = {
        identifier: "https://api.example.com",
        name: " Core API ",
        redirectUris: ["https://app.example.com/callback"],
      };

      expect(yield* requiredString(input, "name")).toBe("Core API");
      expect(yield* requiredUrl(input, "identifier")).toBe(
        "https://api.example.com/",
      );
      expect(yield* urlList(input, "redirectUris")).toEqual([
        "https://app.example.com/callback",
      ]);
    }),
  );

  it.effect("rejects non-http API identifiers", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        requiredUrl({ identifier: "urn:chikara:api" }, "identifier"),
      );
      expect(error).toBeInstanceOf(DashboardError);
    }),
  );

  it.effect("accepts custom schemes for native application callbacks", () =>
    Effect.gen(function* () {
      const urls = yield* urlList(
        {
          redirectUris: ["chikara://", "http://localhost:8081/callback"],
        },
        "redirectUris",
      );
      expect(urls).toEqual(["chikara://", "http://localhost:8081/callback"]);
    }),
  );

  it.effect("rejects unsafe application callbacks", () =>
    Effect.gen(function* () {
      for (const redirectUri of [
        "javascript:alert(1)",
        "https://app.example.com/callback#fragment",
        "http://app.example.com/callback",
        "not a URL",
      ]) {
        const error = yield* Effect.flip(
          urlList({ redirectUris: [redirectUri] }, "redirectUris"),
        );
        expect(error).toBeInstanceOf(DashboardError);
      }
    }),
  );

  it.effect("normalizes and validates email addresses", () =>
    Effect.gen(function* () {
      expect(
        yield* requiredEmail({ email: " Admin@Example.com " }, "email"),
      ).toBe("admin@example.com");
      const error = yield* Effect.flip(
        requiredEmail({ email: "not-an-email" }, "email"),
      );
      expect(error).toBeInstanceOf(DashboardError);
    }),
  );
});
