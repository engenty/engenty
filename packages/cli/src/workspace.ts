import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findWorkspaceRootFrom } from "@engenty/environment/env";

/**
 * The checkout a command acts on, resolved from the current directory, or
 * null when the CLI runs outside one. Dev-only commands (`setup`, `dev`,
 * `generate`, `reset`, `db …`) need a checkout; `create`, `deploy` and
 * `doctor --remote` do not.
 */
export function currentWorkspaceRoot(startDir = process.cwd()): string | null {
  const root = findWorkspaceRootFrom(startDir);
  return fs.existsSync(path.join(root, "pnpm-workspace.yaml")) ? root : null;
}

export function requireWorkspaceRoot(command: string): string {
  const root = currentWorkspaceRoot();
  if (!root) {
    throw new Error(
      `engenty ${command} runs inside an engenty checkout (a directory tree with pnpm-workspace.yaml). Get one with \`npx engenty create <dir>\` — or, for a server, run \`engenty deploy\`.`
    );
  }
  return root;
}

/**
 * The directory of the `engenty` package the CLI was loaded from: the
 * published tarball's root, or `packages/cli` inside a checkout. Both builds
 * (`dist/*.js`) and the sources (`src/*.ts`) sit one level below it.
 */
export function cliPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readPackageJson(dir: string): { name?: string; version?: string } {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

/**
 * The published package is named `engenty` and carries the release version.
 * Inside a checkout the package is `@engenty/cli` at a placeholder version,
 * and the release version is the root `package.json`'s.
 */
export function cliVersion(): string {
  const own = readPackageJson(cliPackageRoot());
  if (own.name === "engenty" && own.version) {
    return own.version;
  }
  const root = findWorkspaceRootFrom(cliPackageRoot());
  return readPackageJson(root).version ?? "0.0.0";
}

/** The release version a checkout is at, from its root `package.json`. */
export function workspaceVersion(root: string): string | undefined {
  return readPackageJson(root).version;
}

/**
 * Run one of the checkout's own scripts with the terminal attached, so long
 * runs (preflight, purge, the dev stack) stream and prompt as they would from
 * a shell. Returns the exit code; a missing script is an error, never a skip.
 */
export function runWorkspaceScript(params: {
  args?: readonly string[];
  cwd: string;
  env?: Record<string, string>;
  script: string;
}): number {
  const scriptPath = path.join(params.cwd, params.script);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`${params.script} is missing from ${params.cwd}.`);
  }
  const runner = scriptPath.endsWith(".sh") ? "bash" : process.execPath;
  const result = spawnSync(runner, [scriptPath, ...(params.args ?? [])], {
    cwd: params.cwd,
    env: { ...process.env, ...params.env },
    stdio: "inherit",
  });
  return result.status ?? 1;
}

/** Same, for a pnpm invocation inside the checkout. */
export function runPnpmInWorkspace(
  cwd: string,
  args: readonly string[],
  env?: Record<string, string>
): number {
  const result = spawnSync("pnpm", [...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  return result.status ?? 1;
}
