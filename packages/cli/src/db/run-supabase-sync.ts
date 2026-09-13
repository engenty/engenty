import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findWorkspaceRootFrom } from "@engenty/environment/env";

export function runSupabaseSyncScript(params: { cwd?: string } = {}): {
  ok: boolean;
  output: string;
} {
  const cwd = params.cwd ?? findWorkspaceRootFrom(process.cwd());
  const scriptPath = path.join(cwd, "scripts", "supabase-sync.mjs");
  const examplePath = path.join(cwd, "supabase", "config.toml.example");

  if (!(fs.existsSync(scriptPath) && fs.existsSync(examplePath))) {
    throw new Error(
      `scripts/supabase-sync.mjs or supabase/config.toml.example is missing from ${cwd} — is this an engenty checkout?`
    );
  }

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  return { ok: result.status === 0, output };
}
