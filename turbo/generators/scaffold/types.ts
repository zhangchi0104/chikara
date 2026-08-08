import type { PlopTypes } from "@turbo/gen";

export type ProjectType = "library" | "app" | "service";
export type LibraryKind = "blank" | "database";
export type Engine = "postgresql" | "sqlite";
export type Framework = "bun" | "tui" | "hono" | "elysia" | "nitro" | "astro";

export interface ScaffoldAnswers {
  type: ProjectType;
  libraryKind?: LibraryKind;
  engine?: Engine;
  framework?: Framework;
  useEffect?: boolean;
  packageName: string;
  packagePath?: string;
  serviceName?: string;
  rootRelativePath?: string;
  description: string;
  author: string;
}

export type ScaffoldShape = Pick<
  ScaffoldAnswers,
  "type" | "libraryKind" | "engine" | "framework" | "useEffect"
>;

export interface CommandSpec {
  command: string;
  args: string[];
  cwd: string;
}

export interface FrameworkConfig {
  label: string;
  entryFile: string;
  buildCommand: (workspaceRoot: string, packagePath: string) => CommandSpec;
  buildEffectIndexSource: () => string;
  postCreate?: (workspaceRoot: string, packagePath: string) => void;
}

export type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type TsconfigJson = {
  $schema?: string;
  compilerOptions?: {
    plugins?: Array<{ name?: string } & Record<string, unknown>>;
  } & Record<string, unknown>;
} & Record<string, unknown>;

export type ScaffoldAction = PlopTypes.ActionType;
