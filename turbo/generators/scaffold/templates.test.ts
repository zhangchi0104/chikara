import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { buildScaffoldActions } from "./index.ts";
import {
  actionPaths,
  actionTypes,
  EFFECT_PACKAGE_TEMPLATES,
  EFFECT_TSCONFIG_TEMPLATES,
  expectAllStartWith,
  LIBRARY_PACKAGE_TEMPLATES,
  LIBRARY_TSCONFIG_TEMPLATES,
  templateFiles,
} from "./test-helpers.ts";

const SERVICE_TEMPLATE_ROOT =
  "turbo/generators/scaffold/templates/service/hono";

describe("local scaffold templates", () => {
  it("selects the expected app and blank-library template flavors", () => {
    const cases = [
      {
        args: { type: "library", libraryKind: "blank", useEffect: true },
        prefix: "scaffold/templates/library/blank/effect/",
      },
      {
        args: { type: "library", useEffect: false },
        prefix: "scaffold/templates/library/blank/plain/",
      },
      {
        args: { type: "app", framework: "bun", useEffect: true },
        prefix: "scaffold/templates/app/bun/effect/",
      },
      {
        args: { type: "app", framework: "tui", useEffect: false },
        prefix: "scaffold/templates/app/tui/plain/",
      },
    ] as const;

    for (const { args, prefix } of cases) {
      expectAllStartWith(templateFiles(buildScaffoldActions(args)), prefix);
    }
  });

  it("writes local templates below the prepared root-relative path", () => {
    const actions = buildScaffoldActions({
      type: "library",
      libraryKind: "blank",
      useEffect: true,
    });
    expect(actionPaths(actions)).toContain(
      "{{ turbo.paths.root }}/{{ packagePath }}/package.json",
    );
  });

  it("scaffolds PostgreSQL and SQLite database libraries", () => {
    for (const useEffect of [true, false]) {
      const postgres = buildScaffoldActions({
        type: "library",
        libraryKind: "database",
        engine: "postgresql",
        useEffect,
      });
      expectAllStartWith(
        templateFiles(postgres),
        `scaffold/templates/library/database/postgresql/${useEffect ? "effect" : "plain"}/`,
      );
    }

    const sqlite = buildScaffoldActions({
      type: "library",
      libraryKind: "database",
      engine: "sqlite",
      useEffect: true,
    });
    expect(templateFiles(sqlite)).toContain(
      "scaffold/templates/library/database/sqlite/effect/src-queries.ts.hbs",
    );
    expect(actionPaths(sqlite)).toContain(
      "{{ turbo.paths.root }}/{{ packagePath }}/src/drizzle.ts",
    );
  });

  it("adds Vitest configuration to Effect libraries only", () => {
    const effect = buildScaffoldActions({
      type: "library",
      libraryKind: "blank",
      useEffect: true,
    });
    const plain = buildScaffoldActions({
      type: "library",
      libraryKind: "blank",
      useEffect: false,
    });
    expect(actionPaths(effect)).toContain(
      "{{ turbo.paths.root }}/{{ packagePath }}/vitest.config.ts",
    );
    expect(actionPaths(plain)).not.toContain(
      "{{ turbo.paths.root }}/{{ packagePath }}/vitest.config.ts",
    );
  });

  it("keeps generated library source and tests on one TypeScript config", () => {
    for (const template of LIBRARY_TSCONFIG_TEMPLATES) {
      const tsconfig = JSON.parse(readFileSync(template, "utf8")) as {
        compilerOptions: { rootDir: string };
        include: string[];
      };
      expect(tsconfig.compilerOptions.rootDir).toBe(".");
      expect(tsconfig.include).toEqual(["src/**/*", "tests/**/*"]);
    }
    for (const template of LIBRARY_PACKAGE_TEMPLATES) {
      const source = readFileSync(template, "utf8");
      expect(source).toContain('"check": "biome check . && tsc --noEmit"');
      expect(source).not.toContain("tsconfig.test.json");
    }
  });

  it("keeps Effect templates on the TypeScript 7 integration", () => {
    for (const template of EFFECT_PACKAGE_TEMPLATES) {
      const source = readFileSync(template, "utf8");
      expect(source).toContain('"@effect/vitest": "catalog:"');
      expect(source).toContain('"@effect/tsgo": "catalog:"');
      expect(source).toContain('"prepare": "effect-tsgo patch"');
      expect(source).not.toContain("@effect/language-service");
    }
    for (const template of EFFECT_TSCONFIG_TEMPLATES) {
      const tsconfig = JSON.parse(readFileSync(template, "utf8")) as {
        $schema: string;
        compilerOptions: { plugins: Array<{ name: string }> };
      };
      expect(tsconfig.$schema).toBe("./node_modules/@effect/tsgo/schema.json");
      expect(tsconfig.compilerOptions.plugins).toContainEqual({
        name: "@effect/language-service",
      });
    }
  });

  it("keeps Drizzle v1 relational metadata in SQLite clients", () => {
    for (const flavor of ["effect", "plain"]) {
      const source = readFileSync(
        `turbo/generators/scaffold/templates/library/database/sqlite/${flavor}/src-client.ts.hbs`,
        "utf8",
      );
      expect(source).toContain(
        'import { defineRelations } from "drizzle-orm";',
      );
      expect(source).toContain("const relations = defineRelations(schema);");
      expect(source).toContain("relations });");
      expect(source).not.toContain("schema });");
    }
  });
});

describe("Hono Cloudflare Worker service template", () => {
  it("emits the complete Worker scaffold", () => {
    const actions = buildScaffoldActions({ type: "service" });
    expectAllStartWith(
      templateFiles(actions),
      "scaffold/templates/service/hono/",
    );
    expect(actionTypes(actions)).not.toContain("installWorkspace");
    for (const output of [
      "src/app.ts",
      "tests/app.spec.ts",
      "vitest.config.ts",
      "wrangler.jsonc",
      ".gitignore",
    ]) {
      expect(actionPaths(actions)).toContain(
        `{{ turbo.paths.root }}/{{ packagePath }}/${output}`,
      );
    }
    for (const output of [
      "src/db.ts",
      "src/schema.ts",
      "drizzle.config.ts",
      "Dockerfile",
      "compose.yaml",
    ]) {
      expect(actionPaths(actions)).not.toContain(
        `{{ turbo.paths.root }}/{{ packagePath }}/${output}`,
      );
    }
  });

  it("uses Hono and Effect v4 with runnable checks", () => {
    const biome = JSON.parse(
      readFileSync(`${SERVICE_TEMPLATE_ROOT}/biome.json.hbs`, "utf8"),
    ) as { root?: boolean };
    const pkg = readFileSync(
      `${SERVICE_TEMPLATE_ROOT}/package.json.hbs`,
      "utf8",
    );
    const app = readFileSync(`${SERVICE_TEMPLATE_ROOT}/src-app.ts.hbs`, "utf8");
    const entrypoint = readFileSync(
      `${SERVICE_TEMPLATE_ROOT}/src-index.ts.hbs`,
      "utf8",
    );
    expect(pkg).toContain('"hono": "catalog:"');
    expect(pkg).toContain('"effect": "catalog:"');
    expect(pkg).toContain('"@effect/vitest": "catalog:"');
    expect(pkg).toContain('"wrangler": "catalog:"');
    expect(pkg).toContain('"test": "vitest run"');
    expect(pkg).toContain('"prepare": "effect-tsgo patch"');
    expect(biome.root).toBeFalse();
    expect(app).toContain('import { Effect } from "effect";');
    expect(app).toContain('import { Hono } from "hono";');
    expect(app).toContain("Effect.runPromise");
    expect(app).toContain('app.get("/health"');
    expect(entrypoint).toContain('import { app } from "./app.js";');
    expect(entrypoint).toContain("export default app;");
    expect(entrypoint).not.toContain("hostname");
  });

  it("configures Wrangler for a Cloudflare Worker", () => {
    const config = readFileSync(
      `${SERVICE_TEMPLATE_ROOT}/wrangler.jsonc.hbs`,
      "utf8",
    );
    const pkg = readFileSync(
      `${SERVICE_TEMPLATE_ROOT}/package.json.hbs`,
      "utf8",
    );
    expect(config).toContain('"name": "{{ serviceName }}"');
    expect(config).toContain('"main": "src/index.ts"');
    expect(config).toContain('"compatibility_date": "2026-08-10"');
    expect(pkg).toContain('"build": "wrangler deploy --dry-run --outdir dist"');
  });
});
