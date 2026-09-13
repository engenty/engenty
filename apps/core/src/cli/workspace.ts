import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findWorkspaceRootFrom } from "@engenty/environment/env";

/**
 * The checkout a command acts on, resolved from the current directory, or
 * null when the CLI runs outside one. Dev-only commands (`setup`, `dev`,
 * `generate`, `reset`, `db …`) need a checkout; `deploy` and `doctor --remote`
 * do not.
 */
export function currentWorkspaceRoot(startDir = process.cwd()): string | null {
  const root = findWorkspaceRootFrom(startDir);
  return fs.existsSync(path.join(root, "pnpm-workspace.yaml")) ? root : null;
}

export function requireWorkspaceRoot(command: string): string {
  const root = currentWorkspaceRoot();
  if (!root) {
    throw new Error(
      `engenty ${command} runs inside an engenty checkout (a directory tree with pnpm-workspace.yaml). Clone the repository first — or, for a server, run \`engenty deploy\`.`
    );
  }
  return root;
}

/** The root of the tree the CLI itself was loaded from. */
export function cliHomeRoot(): string {
  return findWorkspaceRootFrom(path.dirname(fileURLToPath(import.meta.url)));
}

export function cliVersion(): string {
  const pkgPath = path.join(cliHomeRoot(), "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
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
