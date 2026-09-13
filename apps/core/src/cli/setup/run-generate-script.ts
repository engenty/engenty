import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findWorkspaceRootFrom } from "@engenty/environment/env";

/**
 * `scripts/generate.mjs` belongs to the checkout it generates for: it reads
 * that tree's `engenty.plugins` and the modules on its disk. So it is always
 * the acted-on workspace's copy that runs, never one shipped with the CLI.
 */
export function runGenerateScript(
  params: {
    cwd?: string;
    /** Extra variables for the child — the local Supabase stack's identity. */
    env?: Record<string, string>;
    refresh?: boolean;
  } = {}
): { ok: boolean; output: string } {
  const cwd = params.cwd ?? findWorkspaceRootFrom(process.cwd());
  const scriptPath = path.join(cwd, "scripts", "generate.mjs");
  if (!fs.existsSync(scriptPath)) {
    throw new Error(
      `scripts/generate.mjs is missing from ${cwd} — is this an engenty checkout?`
    );
  }

  const args = [scriptPath];
  if (params.refresh) {
    args.push("--refresh");
  }

  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...params.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  return { ok: result.status === 0, output };
}

/** Run the generator and surface its output; throws when it fails. */
export function generateDerivedArtifacts(
  params: { cwd?: string; env?: Record<string, string>; refresh?: boolean } = {}
): void {
  const result = runGenerateScript(params);
  if (result.output.length > 0) {
    console.log(result.output);
  }
  if (!result.ok) {
    throw new Error("engenty generate failed.");
  }
}
