import { spawnSync } from "node:child_process";
import { findWorkspaceRootFrom } from "@engenty/environment/env";

export function runSupabaseCli(
  args: readonly string[],
  params: { cwd?: string } = {}
): { ok: boolean; output: string } {
  const cwd = params.cwd ?? findWorkspaceRootFrom(process.cwd());
  const result = spawnSync("supabase", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

/**
 * Like {@link runSupabaseCli} but streams the CLI's output live (stdio
 * inherit) instead of capturing it — use for long-running commands
 * (`start`, `db reset`, `migration up`) so progress is visible and the run
 * doesn't look stuck.
 */
export function runSupabaseCliStreaming(
  args: readonly string[],
  params: { cwd?: string } = {}
): { ok: boolean } {
  const cwd = params.cwd ?? findWorkspaceRootFrom(process.cwd());
  const result = spawnSync("supabase", [...args], { cwd, stdio: "inherit" });
  return { ok: result.status === 0 };
}
