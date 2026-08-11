import { buildAppScaffoldActions, isShellOutFramework } from "./app-actions.ts";
import type { ScaffoldAction, ScaffoldShape } from "./types.ts";

type TemplateFile = readonly [template: string, output: string];

const COMMON_FILES: ReadonlyArray<TemplateFile> = [
  ["package.json.hbs", "package.json"],
  ["tsconfig.json.hbs", "tsconfig.json"],
  ["biome.json.hbs", "biome.json"],
  ["src-index.ts.hbs", "src/index.ts"],
  ["CLAUDE.md.hbs", "CLAUDE.md"],
];

const LIBRARY_EXTRA_FILES: ReadonlyArray<TemplateFile> = [
  ["tests-index.spec.ts.hbs", "tests/index.spec.ts"],
];

const LIBRARY_EFFECT_EXTRA_FILES: ReadonlyArray<TemplateFile> = [
  ["vitest.config.ts.hbs", "vitest.config.ts"],
];

const DATABASE_EXTRA_FILES: ReadonlyArray<TemplateFile> = [
  ["src-schema.ts.hbs", "src/schema.ts"],
  ["src-client.ts.hbs", "src/client.ts"],
  ["src-drizzle.ts.hbs", "src/drizzle.ts"],
  ["drizzle.config.ts.hbs", "drizzle.config.ts"],
  ["drizzle-gitkeep.hbs", "drizzle/.gitkeep"],
];

const DATABASE_SQLITE_EXTRA: ReadonlyArray<TemplateFile> = [
  ["src-queries.ts.hbs", "src/queries.ts"],
];

const SERVICE_EXTRA_FILES: ReadonlyArray<TemplateFile> = [
  ["src-app.ts.hbs", "src/app.ts"],
  ["tests-app.spec.ts.hbs", "tests/app.spec.ts"],
  ["vitest.config.ts.hbs", "vitest.config.ts"],
  ["wrangler.jsonc.hbs", "wrangler.jsonc"],
  ["gitignore.hbs", ".gitignore"],
];

const LIBRARY_FILES: ReadonlyArray<TemplateFile> = [
  ...COMMON_FILES,
  ...LIBRARY_EXTRA_FILES,
];

const DATABASE_COMMON_FILES: ReadonlyArray<TemplateFile> = [
  ...COMMON_FILES,
  ...LIBRARY_EXTRA_FILES,
  ...DATABASE_EXTRA_FILES,
];

const DATABASE_SQLITE_FILES: ReadonlyArray<TemplateFile> = [
  ...DATABASE_COMMON_FILES,
  ...DATABASE_SQLITE_EXTRA,
];

const SERVICE_FILES: ReadonlyArray<TemplateFile> = [
  ...COMMON_FILES,
  ...SERVICE_EXTRA_FILES,
];

function templateBase(answers: ScaffoldShape): string {
  if (answers.type === "service") {
    return "scaffold/templates/service/hono";
  }
  const flavor = answers.useEffect ? "effect" : "plain";
  if (answers.type === "app") {
    return `scaffold/templates/app/${answers.framework}/${flavor}`;
  }
  if (answers.libraryKind === "database") {
    return `scaffold/templates/library/database/${answers.engine}/${flavor}`;
  }
  return `scaffold/templates/library/blank/${flavor}`;
}

function libraryBaseFiles(
  answers: Pick<ScaffoldShape, "libraryKind" | "engine">,
): ReadonlyArray<TemplateFile> {
  if (answers.libraryKind !== "database") return LIBRARY_FILES;
  return answers.engine === "sqlite"
    ? DATABASE_SQLITE_FILES
    : DATABASE_COMMON_FILES;
}

function fileListFor(answers: ScaffoldShape): ReadonlyArray<TemplateFile> {
  if (answers.type === "service") return SERVICE_FILES;
  if (answers.type === "app") return COMMON_FILES;
  const baseFiles = libraryBaseFiles(answers);
  return answers.useEffect
    ? [...baseFiles, ...LIBRARY_EFFECT_EXTRA_FILES]
    : baseFiles;
}

export function buildScaffoldActions(answers: ScaffoldShape): ScaffoldAction[] {
  if (answers.type === "app" && isShellOutFramework(answers.framework)) {
    return buildAppScaffoldActions(
      answers.framework,
      answers.useEffect === true,
    );
  }

  const root = "{{ turbo.paths.root }}/{{ packagePath }}";
  const base = templateBase(answers);
  return [
    ...fileListFor(answers).map(([template, output]) => ({
      type: "add" as const,
      path: `${root}/${output}`,
      templateFile: `${base}/${template}`,
    })),
    { type: "symlinkAgentsMd" },
  ];
}
