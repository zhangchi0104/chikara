import { describe, expect, it } from "vitest";
import {
  accountRoutes,
  authenticatedLanding,
  canAccessPage,
  isProtectedPage,
  managementRoutes,
  safeLocalPath,
} from "../src/lib/navigation.js";

describe("dashboard account navigation", () => {
  const administrator = { canManage: true };
  const member = { canManage: false };

  it("routes each account to its default page", () => {
    expect(authenticatedLanding(administrator)).toBe("/apis");
    expect(authenticatedLanding(member)).toBe("/profile");
  });

  it("keeps account pages available while restricting management pages", () => {
    expect(accountRoutes.map(({ href }) => href)).toEqual([
      "/profile",
      "/security",
    ]);
    for (const { href: path } of accountRoutes) {
      for (const variant of [path, `${path}/`]) {
        expect(isProtectedPage(variant)).toBe(true);
        expect(canAccessPage(variant, member)).toBe(true);
        expect(canAccessPage(variant, administrator)).toBe(true);
      }
    }
    expect(managementRoutes.map(({ href }) => href)).toEqual([
      "/apis",
      "/applications",
      "/users",
    ]);
    for (const { href: path } of managementRoutes) {
      for (const variant of [path, `${path}/`]) {
        expect(isProtectedPage(variant)).toBe(true);
        expect(canAccessPage(variant, member)).toBe(false);
        expect(canAccessPage(variant, administrator)).toBe(true);
      }
    }

    for (const path of ["/users/user-1", "/users/user-1/"]) {
      expect(isProtectedPage(path)).toBe(true);
      expect(canAccessPage(path, member)).toBe(false);
      expect(canAccessPage(path, administrator)).toBe(true);
    }
    expect(isProtectedPage("/users-archive")).toBe(false);
    expect(canAccessPage("/users-archive", member)).toBe(true);
  });

  it("accepts only same-origin return paths", () => {
    expect(safeLocalPath("/profile?source=sign-in", "/")).toBe(
      "/profile?source=sign-in",
    );
    expect(safeLocalPath("//evil.example", "/")).toBe("/");
    expect(safeLocalPath("/\\evil.example", "/")).toBe("/");
    expect(safeLocalPath("https://evil.example", "/")).toBe("/");
  });
});
