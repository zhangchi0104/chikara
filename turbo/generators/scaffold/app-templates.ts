import path from "node:path";
import { packageNameFromScaffoldPath } from "./paths.ts";
import type { CommandSpec, PackageJson, TsconfigJson } from "./types.ts";

export function buildCreateHonoCommand(
  workspaceRoot: string,
  packagePath: string,
): CommandSpec {
  return {
    command: "bun",
    args: [
      "create",
      "hono@latest",
      packageNameFromScaffoldPath(packagePath),
      "--template",
      "bun",
      "--pm",
      "bun",
    ],
    cwd: path.dirname(path.join(workspaceRoot, packagePath)),
  };
}

export function buildCreateElysiaCommand(
  workspaceRoot: string,
  packagePath: string,
): CommandSpec {
  return {
    command: "bun",
    args: ["create", "elysia", packageNameFromScaffoldPath(packagePath)],
    cwd: path.dirname(path.join(workspaceRoot, packagePath)),
  };
}

export function buildCreateNitroCommand(
  workspaceRoot: string,
  packagePath: string,
): CommandSpec {
  return {
    command: "bun",
    args: [
      "create",
      "nitro-app@latest",
      packageNameFromScaffoldPath(packagePath),
      "--no-install",
    ],
    cwd: path.dirname(path.join(workspaceRoot, packagePath)),
  };
}

export function buildCreateAstroCommand(
  workspaceRoot: string,
  packagePath: string,
): CommandSpec {
  return {
    command: "bun",
    args: [
      "create",
      "astro@latest",
      packageNameFromScaffoldPath(packagePath),
      "--template",
      "minimal",
      "--no-install",
      "--no-git",
      "--yes",
    ],
    cwd: path.dirname(path.join(workspaceRoot, packagePath)),
  };
}

export function buildHonoEffectIndexSource(): string {
  return `import { Console, Effect } from "effect";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Console.log("GET /");
      return c.text("Hello Hono with Effect!");
    }),
  ),
);

export default app;
`;
}

export function buildElysiaEffectIndexSource(): string {
  return `import { Console, Effect } from "effect";
import { Elysia } from "elysia";

const app = new Elysia()
  .get("/", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* Console.log("GET /");
        return "Hello Elysia with Effect!";
      }),
    ),
  )
  .listen(3000);

console.log(
  \`🦊 Elysia is running at \${app.server?.hostname}:\${app.server?.port}\`,
);
`;
}

export function buildNitroEffectIndexSource(): string {
  return `import { Console, Effect } from "effect";
import { defineHandler } from "nitro";

export default defineHandler(() =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Console.log("GET /api/hello");
      return { api: "works with Effect!" };
    }),
  ),
);
`;
}

export function buildAstroEffectIndexSource(): string {
  return `---
import { Console, Effect } from "effect";

const message = await Effect.runPromise(
  Effect.gen(function* () {
    yield* Console.log("GET /");
    return "Hello Astro with Effect!";
  }),
);
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Astro</title>
  </head>
  <body>
    <h1>{message}</h1>
  </body>
</html>
`;
}

export function buildAppTsconfig(): string {
  return `${JSON.stringify(
    {
      extends: "@repo/typescript-config/tsconfig.base.json",
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noEmit: true,
        composite: false,
        declaration: false,
        declarationMap: false,
        rootDir: ".",
      },
      include: ["src/**/*"],
      exclude: ["node_modules"],
    },
    null,
    2,
  )}\n`;
}

export function buildEffectTsconfig(tsconfig: TsconfigJson): string {
  const plugins = tsconfig.compilerOptions?.plugins ?? [];
  const hasEffectPlugin = plugins.some(
    (plugin) => plugin.name === "@effect/language-service",
  );

  return `${JSON.stringify(
    {
      ...tsconfig,
      $schema: "./node_modules/@effect/tsgo/schema.json",
      compilerOptions: {
        ...tsconfig.compilerOptions,
        plugins: hasEffectPlugin
          ? plugins
          : [...plugins, { name: "@effect/language-service" }],
      },
    },
    null,
    2,
  )}\n`;
}

export function buildEffectPackageJson(pkg: PackageJson): string {
  return `${JSON.stringify(
    {
      ...pkg,
      scripts: {
        ...pkg.scripts,
        prepare: pkg.scripts?.prepare ?? "effect-tsgo patch",
      },
      dependencies: {
        ...pkg.dependencies,
        effect: pkg.dependencies?.effect ?? "catalog:",
      },
      devDependencies: {
        ...pkg.devDependencies,
        "@effect/tsgo": pkg.devDependencies?.["@effect/tsgo"] ?? "catalog:",
        "@effect/vitest": pkg.devDependencies?.["@effect/vitest"] ?? "catalog:",
        typescript: pkg.devDependencies?.typescript ?? "catalog:",
        vitest: pkg.devDependencies?.vitest ?? "catalog:",
      },
    },
    null,
    2,
  )}\n`;
}
