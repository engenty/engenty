import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findWorkspaceRootFrom } from "@engenty/environment/env";

export function resolveSetupScriptPath(startDir = process.cwd()): string {
  const repoRoot = findWorkspaceRootFrom(startDir);
  return path.join(repoRoot, "scripts", "setup.mjs");
}

export function canRunSetupScript(startDir = process.cwd()): boolean {
  return fs.existsSync(resolveSetupScriptPath(startDir));
}

export function runSetupScript(params: {
  cwd?: string;
  refresh?: boolean;
} = {}): { ok: boolean; output: string; ran: boolean } {
  const cwd = params.cwd ?? findWorkspaceRootFrom(process.cwd());
  const scriptPath = path.join(cwd, "scripts", "setup.mjs");

  if (!fs.existsSync(scriptPath)) {
    return { ok: true, output: "", ran: false };
  }

  const args = [scriptPath];
  if (params.refresh) {
    args.push("--refresh");
  }

  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  return {
    ok: result.status === 0,
    output,
    ran: true,
  };
}
