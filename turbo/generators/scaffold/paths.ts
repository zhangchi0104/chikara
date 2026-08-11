import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ProjectType } from "./types.ts";

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const SUBDIR: Record<ProjectType, string> = {
  library: "packages",
  app: "apps",
  service: "services",
};

export function normalizeScaffoldPath(
  input: string,
  _type: ProjectType,
): string {
  return input
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "");
}

export function packageNameFromScaffoldPath(scaffoldPath: string): string {
  return scaffoldPath.replace(/\/+$/g, "").split("/").at(-1) ?? "";
}

export function serviceNameFromScaffoldPath(scaffoldPath: string): string {
  const relativePath = scaffoldPath.slice(`${SUBDIR.service}/`.length);
  return relativePath.split("/").join("-");
}

export function validateScaffoldPath(
  input: string,
  workspaceRoot: string,
  type: ProjectType,
): true | string {
  if (!input) return "path is required";
  const normalized = normalizeScaffoldPath(input, type);
  if (!normalized.startsWith(`${SUBDIR[type]}/`)) {
    return `path must start with ${SUBDIR[type]}/`;
  }
  const segments = normalized.slice(SUBDIR[type].length + 1).split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) => !KEBAB_CASE.test(segment))
  ) {
    return "path segments must be kebab-case names";
  }
  if (type === "service" && segments.length !== 1) {
    return "service path must match services/<name>";
  }
  if (existsSync(path.join(workspaceRoot, normalized))) {
    return `${normalized} already exists`;
  }
  return true;
}

export function getGitUserName(): string {
  try {
    return execSync("git config user.name", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
