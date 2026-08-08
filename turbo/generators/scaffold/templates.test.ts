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

describe("Hono service template", () => {
  it("emits the complete local service scaffold", () => {
    const actions = buildScaffoldActions({ type: "service" });
    expectAllStartWith(
      templateFiles(actions),
      "scaffold/templates/service/hono/",
    );
    expect(actionTypes(actions)).not.toContain("installWorkspace");
    for (const output of [
      "src/app.ts",
      "src/db.ts",
      "src/schema.ts",
      "tests/app.spec.ts",
      "drizzle.config.ts",
      "drizzle/.gitkeep",
      "Dockerfile",
      "compose.yaml",
    ]) {
      expect(actionPaths(actions)).toContain(
        `{{ turbo.paths.root }}/{{ packagePath }}/${output}`,
      );
    }
  });

  it("uses Hono, Drizzle, and PostgreSQL with runnable checks", () => {
    const pkg = readFileSync(
      `${SERVICE_TEMPLATE_ROOT}/package.json.hbs`,
      "utf8",
    );
    const app = readFileSync(`${SERVICE_TEMPLATE_ROOT}/src-app.ts.hbs`, "utf8");
    const db = readFileSync(`${SERVICE_TEMPLATE_ROOT}/src-db.ts.hbs`, "utf8");
    const config = readFileSync(
      `${SERVICE_TEMPLATE_ROOT}/drizzle.config.ts.hbs`,
      "utf8",
    );
    expect(pkg).toContain('"hono": "catalog:"');
    expect(pkg).toContain('"drizzle-orm": "catalog:"');
    expect(pkg).toContain('"test": "bun test"');
    expect(app).toContain('import { Hono } from "hono";');
    expect(app).toContain('import { db } from "./db.ts";');
    expect(app).not.toContain("createDb");
    expect(app).toContain('app.get("/health"');
    expect(db).toContain('from "drizzle-orm/bun-sql"');
    expect(db).toContain("export const db = drizzle(");
    expect(db).toContain("process.env.DATABASE_URL");
    expect(db).not.toContain("createDb");
    expect(config).toContain('dialect: "postgresql"');
  });

  it("registers the container with Traefik on the shared network", () => {
    const compose = readFileSync(
      `${SERVICE_TEMPLATE_ROOT}/compose.yaml.hbs`,
      "utf8",
    );
    expect(compose).toContain('traefik.enable: "true"');
    expect(compose).toContain("traefik.http.routers.{{ serviceName }}.rule");
    expect(compose).toContain(
      "traefik.http.services.{{ serviceName }}.loadbalancer.server.port",
    );
    expect(compose).toContain(`\${TRAEFIK_NETWORK:-chikara-gateway}`);
    expect(compose).toContain("external: true");
  });

  it("builds from the workspace and serves the generated bundle", () => {
    const dockerfile = readFileSync(
      `${SERVICE_TEMPLATE_ROOT}/Dockerfile.hbs`,
      "utf8",
    );
    expect(dockerfile).toContain("RUN bun install --frozen-lockfile");
    expect(dockerfile).toContain("FROM dependencies AS development");
    expect(dockerfile).toContain("FROM oven/bun:1.3.14 AS production");
    expect(dockerfile).toContain('CMD ["bun", "dist/index.js"]');
  });
});
