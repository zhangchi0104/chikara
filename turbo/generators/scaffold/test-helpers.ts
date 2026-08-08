import { expect } from "bun:test";

type ActionLike = { type: string; templateFile?: string; path?: string };

const asActionLikes = (actions: readonly unknown[]): readonly ActionLike[] =>
  actions as readonly ActionLike[];

export const actionTypes = (actions: readonly unknown[]): string[] =>
  asActionLikes(actions).map((action) => action.type);

export const templateFiles = (actions: readonly unknown[]): string[] =>
  asActionLikes(actions)
    .filter(
      (action): action is ActionLike & { templateFile: string } =>
        action.type === "add" && typeof action.templateFile === "string",
    )
    .map((action) => action.templateFile);

export const actionPaths = (actions: readonly unknown[]): string[] =>
  asActionLikes(actions)
    .filter(
      (action): action is ActionLike & { path: string } =>
        typeof action.path === "string",
    )
    .map((action) => action.path);

export const expectAllStartWith = (paths: string[], prefix: string): void => {
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) expect(path).toStartWith(prefix);
};

export const EFFECT_PACKAGE_TEMPLATES = [
  "turbo/generators/scaffold/templates/app/bun/effect/package.json.hbs",
  "turbo/generators/scaffold/templates/app/tui/effect/package.json.hbs",
  "turbo/generators/scaffold/templates/library/blank/effect/package.json.hbs",
  "turbo/generators/scaffold/templates/library/database/postgresql/effect/package.json.hbs",
  "turbo/generators/scaffold/templates/library/database/sqlite/effect/package.json.hbs",
] as const;

export const EFFECT_TSCONFIG_TEMPLATES = [
  "turbo/generators/scaffold/templates/app/bun/effect/tsconfig.json.hbs",
  "turbo/generators/scaffold/templates/app/tui/effect/tsconfig.json.hbs",
  "turbo/generators/scaffold/templates/library/blank/effect/tsconfig.json.hbs",
  "turbo/generators/scaffold/templates/library/database/postgresql/effect/tsconfig.json.hbs",
  "turbo/generators/scaffold/templates/library/database/sqlite/effect/tsconfig.json.hbs",
] as const;

export const LIBRARY_PACKAGE_TEMPLATES = [
  "turbo/generators/scaffold/templates/library/blank/effect/package.json.hbs",
  "turbo/generators/scaffold/templates/library/blank/plain/package.json.hbs",
  "turbo/generators/scaffold/templates/library/database/postgresql/effect/package.json.hbs",
  "turbo/generators/scaffold/templates/library/database/postgresql/plain/package.json.hbs",
  "turbo/generators/scaffold/templates/library/database/sqlite/effect/package.json.hbs",
  "turbo/generators/scaffold/templates/library/database/sqlite/plain/package.json.hbs",
] as const;

export const LIBRARY_TSCONFIG_TEMPLATES = [
  "turbo/generators/scaffold/templates/library/blank/effect/tsconfig.json.hbs",
  "turbo/generators/scaffold/templates/library/blank/plain/tsconfig.json.hbs",
  "turbo/generators/scaffold/templates/library/database/postgresql/effect/tsconfig.json.hbs",
  "turbo/generators/scaffold/templates/library/database/postgresql/plain/tsconfig.json.hbs",
  "turbo/generators/scaffold/templates/library/database/sqlite/effect/tsconfig.json.hbs",
  "turbo/generators/scaffold/templates/library/database/sqlite/plain/tsconfig.json.hbs",
] as const;
