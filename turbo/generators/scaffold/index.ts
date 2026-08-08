import { execFileSync } from "node:child_process";
import { mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import type { PlopTypes } from "@turbo/gen";
import { registerFrameworkActions } from "./app-actions.ts";
import {
  normalizeScaffoldPath,
  packageNameFromScaffoldPath,
  rootRelativePathFromScaffoldPath,
  serviceNameFromScaffoldPath,
} from "./paths.ts";
import { getScaffoldPrompts, getServicePrompts } from "./prompts.ts";
import { buildScaffoldActions } from "./template-actions.ts";
import type { ScaffoldAnswers, ScaffoldShape } from "./types.ts";

function getPackagePath(answers: ScaffoldAnswers): string {
  return (
    answers.packagePath ??
    normalizeScaffoldPath(answers.packageName, answers.type)
  );
}

export function registerScaffoldGenerator(plop: PlopTypes.NodePlopAPI): void {
  const workspaceRoot = plop.getDestBasePath();

  plop.setActionType("prepareScaffoldPath", (rawAnswers) => {
    const answers = rawAnswers as ScaffoldAnswers;
    const packagePath = normalizeScaffoldPath(
      answers.packageName,
      answers.type,
    );
    answers.packagePath = packagePath;
    answers.packageName = packageNameFromScaffoldPath(packagePath);
    answers.rootRelativePath = rootRelativePathFromScaffoldPath(
      workspaceRoot,
      packagePath,
    );
    if (answers.type === "service") {
      answers.serviceName = serviceNameFromScaffoldPath(packagePath);
    }
    mkdirSync(path.dirname(path.join(workspaceRoot, packagePath)), {
      recursive: true,
    });
    return `prepared scaffold path ${packagePath}`;
  });

  plop.setActionType("symlinkAgentsMd", (rawAnswers) => {
    const answers = rawAnswers as ScaffoldAnswers;
    const packagePath = getPackagePath(answers);
    symlinkSync(
      "CLAUDE.md",
      path.join(workspaceRoot, packagePath, "AGENTS.md"),
    );
    return `symlinked AGENTS.md -> CLAUDE.md in ${packagePath}`;
  });

  plop.setActionType("installWorkspace", () => {
    execFileSync("bun", ["install"], {
      cwd: workspaceRoot,
      stdio: "inherit",
    });
    return "ran bun install at workspace root";
  });

  registerFrameworkActions(plop, workspaceRoot);

  plop.setGenerator("scaffold", {
    description: "Scaffold a library, application, or Hono and Drizzle service",
    prompts: getScaffoldPrompts(workspaceRoot),
    actions: (data) => {
      if (!data) return [];
      return [
        { type: "prepareScaffoldPath" },
        ...buildScaffoldActions(data as ScaffoldShape),
      ];
    },
  });

  plop.setGenerator("service", {
    description: "Scaffold a Hono and Drizzle service registered with Traefik",
    prompts: getServicePrompts(workspaceRoot),
    actions: (data) => {
      if (!data) return [];
      const answers = data as ScaffoldAnswers;
      answers.type = "service";
      return [
        { type: "prepareScaffoldPath" },
        ...buildScaffoldActions({ type: "service" }),
      ];
    },
  });
}

export {
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
export {
  normalizeScaffoldPath,
  packageNameFromScaffoldPath,
  rootRelativePathFromScaffoldPath,
  serviceNameFromScaffoldPath,
} from "./paths.ts";
export { getScaffoldPrompts, getServicePrompts } from "./prompts.ts";
export { buildScaffoldActions } from "./template-actions.ts";
