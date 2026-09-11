// Runs apps/ai's Mastra schema init from the db CLI.
//
// It lives in apps/ai because `@mastra/pg` is that workspace's dependency, and
// it is a migration step rather than a boot step because Mastra's idempotent
// DDL reloads PostgREST's schema cache — see apps/ai/src/ai/mastra-storage.ts.
import { spawnSync } from "node:child_process";
import { findWorkspaceRootFrom } from "@engenty/environment/env";

export interface MastraSchemaInitResult {
  ok: boolean;
  output: string;
  /** False when there is no workspace to run it in (published/standalone CLI). */
  ran: boolean;
}

export function runMastraSchemaInitScript(): MastraSchemaInitResult {
  const workspaceRoot = findWorkspaceRootFrom(process.cwd());
  if (!workspaceRoot) {
    return { ok: true, output: "", ran: false };
  }
  const result = spawnSync(
    "pnpm",
    ["--filter", "@engenty/ai", "run", "db:mastra-init"],
    { cwd: workspaceRoot, encoding: "utf8" }
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { ok: result.status === 0, output, ran: true };
}
