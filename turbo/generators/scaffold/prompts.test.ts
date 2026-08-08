import { describe, expect, it } from "bun:test";
import {
  getScaffoldPrompts,
  getServicePrompts,
  normalizeScaffoldPath,
  packageNameFromScaffoldPath,
  rootRelativePathFromScaffoldPath,
  serviceNameFromScaffoldPath,
} from "./index.ts";

describe("scaffold prompts and paths", () => {
  it("offers a dedicated service generator without conditional prompts", () => {
    const prompts = getServicePrompts("/repo");

    expect(prompts.map((prompt) => prompt.name)).toEqual([
      "packageName",
      "description",
      "author",
    ]);
    expect(prompts.every((prompt) => prompt.when === undefined)).toBe(true);
  });

  it("offers libraries, apps, and services with shape-specific follow-ups", () => {
    const prompts = getScaffoldPrompts("/repo");
    expect(prompts.map((prompt) => prompt.name)).toEqual([
      "type",
      "libraryKind",
      "engine",
      "framework",
      "useEffect",
      "packageName",
      "description",
      "author",
    ]);

    const type = prompts.find((prompt) => prompt.name === "type") as {
      choices?: ReadonlyArray<{ name: string; value: string }>;
    };
    expect(type.choices).toContainEqual({
      name: "service (services/<name>)",
      value: "service",
    });

    const libraryKind = prompts.find(
      (prompt) => prompt.name === "libraryKind",
    ) as { when?: (answers: { type: string }) => boolean };
    expect(libraryKind.when?.({ type: "library" })).toBe(true);
    expect(libraryKind.when?.({ type: "app" })).toBe(false);
    expect(libraryKind.when?.({ type: "service" })).toBe(false);

    const engine = prompts.find((prompt) => prompt.name === "engine") as {
      when?: (answers: { libraryKind?: string }) => boolean;
    };
    expect(engine.when?.({ libraryKind: "database" })).toBe(true);
    expect(engine.when?.({ libraryKind: "blank" })).toBe(false);

    const framework = prompts.find((prompt) => prompt.name === "framework") as {
      when?: (answers: { type: string }) => boolean;
      choices?: ReadonlyArray<{ name: string; value: string }>;
    };
    expect(framework.when?.({ type: "app" })).toBe(true);
    expect(framework.when?.({ type: "service" })).toBe(false);
    for (const choice of ["tui", "hono", "elysia", "nitro", "astro"]) {
      expect(framework.choices?.map(({ value }) => value)).toContain(choice);
    }

    const useEffect = prompts.find((prompt) => prompt.name === "useEffect") as {
      when?: (answers: { type: string }) => boolean;
    };
    expect(useEffect).toMatchObject({
      type: "confirm",
      message: "Use Effect?",
      default: true,
    });
    expect(useEffect.when?.({ type: "library" })).toBe(true);
    expect(useEffect.when?.({ type: "service" })).toBe(false);
  });

  it("validates root-relative kebab-case paths under each workspace folder", () => {
    const pathPrompt = getScaffoldPrompts("/repo").find(
      (prompt) => prompt.name === "packageName",
    ) as {
      message?: (answers: { type: "library" | "app" | "service" }) => string;
      validate?: (
        input: string,
        answers: { type: "library" | "app" | "service" },
      ) => true | string;
    };

    expect(pathPrompt.message?.({ type: "service" })).toBe(
      "Path from project root (services/<path>):",
    );
    expect(
      pathPrompt.validate?.("packages/tools/logger", { type: "library" }),
    ).toBe(true);
    expect(pathPrompt.validate?.("apps/admin/api", { type: "app" })).toBe(true);
    expect(
      pathPrompt.validate?.("services/billing-api", { type: "service" }),
    ).toBe(true);
    expect(
      pathPrompt.validate?.("services/billing/api", { type: "service" }),
    ).toBe("service path must match services/<name>");
    expect(pathPrompt.validate?.("apps/api", { type: "service" })).toBe(
      "path must start with services/",
    );
    expect(pathPrompt.validate?.("services/../api", { type: "service" })).toBe(
      "path segments must be kebab-case names",
    );
  });

  it("derives package, service, and Docker-context paths", () => {
    expect(packageNameFromScaffoldPath("services/billing-api/")).toBe(
      "billing-api",
    );
    expect(serviceNameFromScaffoldPath("services/billing-api")).toBe(
      "billing-api",
    );
    expect(
      rootRelativePathFromScaffoldPath("/repo", "services/billing-api"),
    ).toBe("../..");
  });

  it("normalizes root-relative paths", () => {
    expect(normalizeScaffoldPath("/packages/tools/logger/", "library")).toBe(
      "packages/tools/logger",
    );
    expect(normalizeScaffoldPath("\\services\\billing\\api\\", "service")).toBe(
      "services/billing/api",
    );
  });
});
