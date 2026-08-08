import type { PlopTypes } from "@turbo/gen";
import { getGitUserName, SUBDIR, validateScaffoldPath } from "./paths.ts";
import type { ScaffoldAnswers } from "./types.ts";

export function getScaffoldPrompts(
  workspaceRoot: string,
): PlopTypes.PromptQuestion[] {
  return [
    {
      type: "list",
      name: "type",
      message: "What are you scaffolding?",
      choices: [
        { name: "library (packages/<name>)", value: "library" },
        { name: "app (apps/<name>)", value: "app" },
        { name: "service (services/<name>)", value: "service" },
      ],
      default: "library",
    },
    {
      type: "list",
      name: "libraryKind",
      message: "Library kind?",
      choices: [
        { name: "Blank", value: "blank" },
        { name: "Database (Drizzle)", value: "database" },
      ],
      default: "blank",
      when: (answers: Pick<ScaffoldAnswers, "type">) =>
        answers.type === "library",
    },
    {
      type: "list",
      name: "engine",
      message: "Which database engine?",
      choices: [
        { name: "PostgreSQL", value: "postgresql" },
        { name: "SQLite (Bun)", value: "sqlite" },
      ],
      when: (answers: Pick<ScaffoldAnswers, "libraryKind">) =>
        answers.libraryKind === "database",
    },
    {
      type: "list",
      name: "framework",
      message: "Which framework?",
      choices: [
        { name: "Bun (no framework)", value: "bun" },
        { name: "TUI", value: "tui" },
        { name: "Hono", value: "hono" },
        { name: "Elysia", value: "elysia" },
        { name: "Nitro", value: "nitro" },
        { name: "Astro", value: "astro" },
      ],
      default: "bun",
      when: (answers: Pick<ScaffoldAnswers, "type">) => answers.type === "app",
    },
    {
      type: "confirm",
      name: "useEffect",
      message: "Use Effect?",
      default: true,
      when: (answers: Pick<ScaffoldAnswers, "type">) =>
        answers.type !== "service",
    },
    {
      type: "input",
      name: "packageName",
      message: (answers: Pick<ScaffoldAnswers, "type">) =>
        `Path from project root (${SUBDIR[answers.type]}/<path>):`,
      validate: (input: string, answers: Pick<ScaffoldAnswers, "type">) =>
        validateScaffoldPath(input, workspaceRoot, answers.type),
    },
    {
      type: "input",
      name: "description",
      message: "Description (optional):",
      default: "",
    },
    {
      type: "input",
      name: "author",
      message: "Author:",
      default: getGitUserName,
    },
  ];
}

export function getServicePrompts(
  workspaceRoot: string,
): PlopTypes.PromptQuestion[] {
  return [
    {
      type: "input",
      name: "packageName",
      message: "Path from project root (services/<name>):",
      validate: (input: string) =>
        validateScaffoldPath(input, workspaceRoot, "service"),
    },
    {
      type: "input",
      name: "description",
      message: "Description (optional):",
      default: "",
    },
    {
      type: "input",
      name: "author",
      message: "Author:",
      default: getGitUserName,
    },
  ];
}
