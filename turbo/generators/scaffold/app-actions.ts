import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PlopTypes } from "@turbo/gen";
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
} from "./app-templates.ts";
import { normalizeScaffoldPath, packageNameFromScaffoldPath } from "./paths.ts";
import type {
  Framework,
  FrameworkConfig,
  PackageJson,
  ScaffoldAction,
  ScaffoldAnswers,
  TsconfigJson,
} from "./types.ts";

type ShellOutFramework = "hono" | "elysia" | "nitro" | "astro";

function updatePackageJson(
  appDir: string,
  mutate: (pkg: PackageJson) => void,
): void {
  const pkgPath = path.join(appDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;
  mutate(pkg);
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function applyRepoTsconfig(workspaceRoot: string, packagePath: string): void {
  const appDir = path.join(workspaceRoot, packagePath);
  writeFileSync(path.join(appDir, "tsconfig.json"), buildAppTsconfig());
  updatePackageJson(appDir, (pkg) => {
    pkg.devDependencies = {
      ...pkg.devDependencies,
      "@repo/typescript-config": "workspace:*",
    };
  });
}

const FRAMEWORK_CONFIGS: Record<ShellOutFramework, FrameworkConfig> = {
  hono: {
    label: "Hono",
    entryFile: "src/index.ts",
    buildCommand: buildCreateHonoCommand,
    buildEffectIndexSource: buildHonoEffectIndexSource,
    postCreate: applyRepoTsconfig,
  },
  elysia: {
    label: "Elysia",
    entryFile: "src/index.ts",
    buildCommand: buildCreateElysiaCommand,
    buildEffectIndexSource: buildElysiaEffectIndexSource,
    postCreate: applyRepoTsconfig,
  },
  nitro: {
    label: "Nitro",
    entryFile: "server/api/hello.ts",
    buildCommand: buildCreateNitroCommand,
    buildEffectIndexSource: buildNitroEffectIndexSource,
    postCreate: (workspaceRoot, packagePath) => {
      const appDir = path.join(workspaceRoot, packagePath);
      updatePackageJson(appDir, (pkg) => {
        pkg.name = packageNameFromScaffoldPath(packagePath);
      });
      rmSync(path.join(appDir, "AGENTS.md"), { force: true });
    },
  },
  astro: {
    label: "Astro",
    entryFile: "src/pages/index.astro",
    buildCommand: buildCreateAstroCommand,
    buildEffectIndexSource: buildAstroEffectIndexSource,
  },
};

export function isShellOutFramework(
  framework?: Framework,
): framework is ShellOutFramework {
  return framework !== undefined && framework in FRAMEWORK_CONFIGS;
}

export function buildAppScaffoldActions(
  framework: ShellOutFramework,
  useEffect: boolean,
): ScaffoldAction[] {
  const { label } = FRAMEWORK_CONFIGS[framework];
  const actions: ScaffoldAction[] = [{ type: `create${label}App` }];
  if (useEffect) actions.push({ type: `patch${label}Effect` });
  actions.push({ type: "symlinkAgentsMd" });
  actions.push({ type: "installWorkspace" });
  return actions;
}

function patchAppEffectInstall(
  workspaceRoot: string,
  packagePath: string,
  config: FrameworkConfig,
): void {
  const appDir = path.join(workspaceRoot, packagePath);
  const pkgPath = path.join(appDir, "package.json");
  const tsconfigPath = path.join(appDir, "tsconfig.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;
  const tsconfig = JSON.parse(
    readFileSync(tsconfigPath, "utf8"),
  ) as TsconfigJson;

  writeFileSync(pkgPath, buildEffectPackageJson(pkg));
  writeFileSync(tsconfigPath, buildEffectTsconfig(tsconfig));
  writeFileSync(
    path.join(appDir, config.entryFile),
    config.buildEffectIndexSource(),
  );
}

function getPackagePath(answers: ScaffoldAnswers): string {
  return (
    answers.packagePath ??
    normalizeScaffoldPath(answers.packageName, answers.type)
  );
}

export function registerFrameworkActions(
  plop: PlopTypes.NodePlopAPI,
  workspaceRoot: string,
): void {
  for (const config of Object.values(FRAMEWORK_CONFIGS)) {
    plop.setActionType(`create${config.label}App`, (rawAnswers) => {
      const answers = rawAnswers as ScaffoldAnswers;
      const packagePath = getPackagePath(answers);
      mkdirSync(path.dirname(path.join(workspaceRoot, packagePath)), {
        recursive: true,
      });

      const { command, args, cwd } = config.buildCommand(
        workspaceRoot,
        packagePath,
      );
      execFileSync(command, args, { cwd, stdio: "inherit" });

      const appDir = path.join(workspaceRoot, packagePath);
      rmSync(path.join(appDir, "node_modules"), {
        recursive: true,
        force: true,
      });
      rmSync(path.join(appDir, "bun.lock"), { force: true });
      config.postCreate?.(workspaceRoot, packagePath);
      return `created ${config.label} app in ${packagePath}`;
    });

    plop.setActionType(`patch${config.label}Effect`, (rawAnswers) => {
      const answers = rawAnswers as ScaffoldAnswers;
      const packagePath = getPackagePath(answers);
      patchAppEffectInstall(workspaceRoot, packagePath, config);
      return `configured Effect in ${packagePath}`;
    });
  }
}
