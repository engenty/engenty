import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findWorkspaceRootFrom } from "@engenty/environment/env";

export function resolveSupabaseSyncScriptPath(
  startDir = process.cwd()
): string {
  const repoRoot = findWorkspaceRootFrom(startDir);
  return path.join(repoRoot, "scripts", "supabase-sync.mjs");
}

export function canRunSupabaseSync(startDir = process.cwd()): boolean {
  const repoRoot = findWorkspaceRootFrom(startDir);
  const scriptPath = path.join(repoRoot, "scripts", "supabase-sync.mjs");
  const examplePath = path.join(repoRoot, "supabase", "config.toml.example");
  return fs.existsSync(scriptPath) && fs.existsSync(examplePath);
}

export function runSupabaseSyncScript(params: { cwd?: string } = {}): {
  ok: boolean;
  output: string;
  ran: boolean;
} {
  const cwd = params.cwd ?? findWorkspaceRootFrom(process.cwd());
  const scriptPath = path.join(cwd, "scripts", "supabase-sync.mjs");
  const examplePath = path.join(cwd, "supabase", "config.toml.example");

  if (!(fs.existsSync(scriptPath) && fs.existsSync(examplePath))) {
    return { ok: true, output: "", ran: false };
  }

  const result = spawnSync(process.execPath, [scriptPath], {
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
