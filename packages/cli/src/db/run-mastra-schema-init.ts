// Runs apps/ai's Mastra schema init from the db CLI.
//
// It lives in apps/ai because `@mastra/pg` is that workspace's dependency, and
// it is a migration step rather than a boot step because Mastra's idempotent
// DDL reloads PostgREST's schema cache — see apps/ai/src/ai/mastra-storage.ts.
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  findWorkspaceRootFrom,
  mergeWorkspaceDotEnvLayers,
} from "@engenty/environment/env";

export interface MastraSchemaInitResult {
  ok: boolean;
  output: string;
  /** False when there is no workspace to run it in (published/standalone CLI). */
  ran: boolean;
}

/** The keys apps/ai's init script resolves its connection string from. */
const CONNECTION_KEYS = [
  "SUPABASE_DB_URL",
  "ENGENTY_WORKSPACE_VECTOR_DB_URL",
] as const;

/**
 * The child's environment: this process's, with the connection string read
 * from the env files NOW.
 *
 * The CLI loaded `.env.local` when it started. `engenty setup` writes that
 * file (env init) and then runs this step in the same process, so the value
 * the child needs is on disk but not in `process.env` — and on a rerun of
 * env init against another stack, the process holds the OLD port. The file
 * is what was just written, so for these two keys it wins.
 */
export function mastraInitChildEnv(
  workspaceRoot: string,
  baseEnv: Record<string, string | undefined> = process.env
): Record<string, string | undefined> {
  const fromFiles = mergeWorkspaceDotEnvLayers(
    workspaceRoot,
    path.join(workspaceRoot, "apps", "ai")
  );
  const env = { ...baseEnv };
  for (const key of CONNECTION_KEYS) {
    const value = fromFiles[key]?.trim();
    if (value) {
      env[key] = value;
    }
  }
  return env;
}

export function runMastraSchemaInitScript(): MastraSchemaInitResult {
  const workspaceRoot = findWorkspaceRootFrom(process.cwd());
  if (!workspaceRoot) {
    return { ok: true, output: "", ran: false };
  }
  const result = spawnSync(
    "pnpm",
    ["--filter", "@engenty/ai", "run", "db:mastra-init"],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      env: mastraInitChildEnv(workspaceRoot),
    }
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { ok: result.status === 0, output, ran: true };
}
