import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findWorkspaceRootFrom } from "@engenty/environment/env";

export type DbSnapshotAction = "snapshot" | "restore";

export function resolveDbSnapshotScriptPath(startDir = process.cwd()): string {
  const repoRoot = findWorkspaceRootFrom(startDir);
  return path.join(repoRoot, "scripts", "db-snapshot.mjs");
}

export function canRunDbSnapshot(startDir = process.cwd()): boolean {
  return fs.existsSync(resolveDbSnapshotScriptPath(startDir));
}

export function runDbSnapshotScript(params: {
  action: DbSnapshotAction;
  cwd?: string;
  file?: string;
}): { ok: boolean; output: string; ran: boolean } {
  const cwd = params.cwd ?? findWorkspaceRootFrom(process.cwd());
  const scriptPath = path.join(cwd, "scripts", "db-snapshot.mjs");

  if (!fs.existsSync(scriptPath)) {
    return { ok: true, output: "", ran: false };
  }

  const args = [scriptPath, params.action];
  if (params.file) {
    args.push(params.file);
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
