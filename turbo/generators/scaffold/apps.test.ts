import { describe, expect, it } from "bun:test";
import {
  buildAppTsconfig,
  buildAstroEffectIndexSource,
  buildCreateAstroCommand,
  buildCreateElysiaCommand,
  buildCreateHonoCommand,
  buildCreateNitroCommand,
  buildEffectPackageJson,
  buildEffectTsconfig,
  buildElysiaEffectIndexSource,
  buildHonoEffectIndexSource,
  buildNitroEffectIndexSource,
  buildScaffoldActions,
} from "./index.ts";
import { actionTypes } from "./test-helpers.ts";

describe("shell-out application scaffolds", () => {
  it("creates each framework app and installs the workspace", () => {
    const cases = [
      ["hono", "Hono"],
      ["elysia", "Elysia"],
      ["nitro", "Nitro"],
      ["astro", "Astro"],
    ] as const;

    for (const [framework, label] of cases) {
      expect(
        actionTypes(
          buildScaffoldActions({ type: "app", framework, useEffect: false }),
        ),
      ).toEqual([`create${label}App`, "symlinkAgentsMd", "installWorkspace"]);
      expect(
        actionTypes(
          buildScaffoldActions({ type: "app", framework, useEffect: true }),
        ),
      ).toEqual([
        `create${label}App`,
        `patch${label}Effect`,
        "symlinkAgentsMd",
        "installWorkspace",
      ]);
    }
  });

  it("builds the official Hono Bun command below nested app paths", () => {
    expect(buildCreateHonoCommand("/repo", "apps/admin/api")).toEqual({
      command: "bun",
      args: [
        "create",
        "hono@latest",
        "api",
        "--template",
        "bun",
        "--pm",
        "bun",
      ],
      cwd: "/repo/apps/admin",
    });
  });

  it("builds the Elysia create command", () => {
    expect(buildCreateElysiaCommand("/repo", "apps/admin/api")).toEqual({
      command: "bun",
      args: ["create", "elysia", "api"],
      cwd: "/repo/apps/admin",
    });
  });

  it("builds the non-installing Nitro create command", () => {
    expect(buildCreateNitroCommand("/repo", "apps/admin/api")).toEqual({
      command: "bun",
      args: ["create", "nitro-app@latest", "api", "--no-install"],
      cwd: "/repo/apps/admin",
    });
  });

  it("builds the non-installing Astro minimal-template command", () => {
    expect(buildCreateAstroCommand("/repo", "apps/web/site")).toEqual({
      command: "bun",
      args: [
        "create",
        "astro@latest",
        "site",
        "--template",
        "minimal",
        "--no-install",
        "--no-git",
        "--yes",
      ],
      cwd: "/repo/apps/web",
    });
  });
});

describe("application Effect patches", () => {
  it("generates framework-specific Effect entrypoints", () => {
    const hono = buildHonoEffectIndexSource();
    expect(hono).toContain('import { Hono } from "hono";');
    expect(hono).toContain("Effect.runPromise");
    expect(hono).toContain("export default app;");

    const elysia = buildElysiaEffectIndexSource();
    expect(elysia).toContain('import { Elysia } from "elysia";');
    expect(elysia).toContain("Effect.runPromise");
    expect(elysia).toContain(".listen(3000)");

    const nitro = buildNitroEffectIndexSource();
    expect(nitro).toContain('import { defineHandler } from "nitro";');
    expect(nitro).toContain("Effect.runPromise");

    const astro = buildAstroEffectIndexSource();
    expect(astro).toContain('import { Console, Effect } from "effect";');
    expect(astro).toContain("<h1>{message}</h1>");
  });

  it("emits an app TypeScript config based on the shared package", () => {
    const tsconfig = JSON.parse(buildAppTsconfig()) as {
      extends: string;
      compilerOptions: Record<string, unknown>;
      include: string[];
    };
    expect(tsconfig.extends).toBe("@repo/typescript-config/tsconfig.base.json");
    expect(tsconfig.compilerOptions).toMatchObject({
      module: "NodeNext",
      moduleResolution: "NodeNext",
      noEmit: true,
      composite: false,
      rootDir: ".",
    });
    expect(tsconfig.include).toEqual(["src/**/*"]);
  });

  it("preserves framework config while adding the Effect plugin", () => {
    const tsconfig = JSON.parse(
      buildEffectTsconfig({
        extends: "astro/tsconfigs/base",
        compilerOptions: { jsx: "preserve" },
        include: [".astro/types.d.ts", "src/**/*"],
      }),
    ) as {
      $schema: string;
      extends: string;
      compilerOptions: {
        jsx: string;
        plugins: Array<{ name: string }>;
      };
      include: string[];
    };
    expect(tsconfig.$schema).toBe("./node_modules/@effect/tsgo/schema.json");
    expect(tsconfig.extends).toBe("astro/tsconfigs/base");
    expect(tsconfig.compilerOptions.jsx).toBe("preserve");
    expect(tsconfig.compilerOptions.plugins).toContainEqual({
      name: "@effect/language-service",
    });
    expect(tsconfig.include).toEqual([".astro/types.d.ts", "src/**/*"]);
  });

  it("preserves app metadata while adding Effect dependencies", () => {
    const pkg = JSON.parse(
      buildEffectPackageJson({
        name: "site",
        scripts: { dev: "astro dev" },
        dependencies: { astro: "^5.0.0" },
        devDependencies: {},
      }),
    ) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts.dev).toBe("astro dev");
    expect(pkg.scripts.prepare).toBe("effect-tsgo patch");
    expect(pkg.dependencies.effect).toBe("catalog:");
    expect(pkg.devDependencies["@effect/tsgo"]).toBe("catalog:");
    expect(pkg.devDependencies["@effect/vitest"]).toBe("catalog:");
    expect(pkg.devDependencies.typescript).toBe("catalog:");
    expect(pkg.devDependencies.vitest).toBe("catalog:");
  });
});
