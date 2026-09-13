import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findWorkspaceRootFrom } from "@engenty/environment/env";
import { runMastraSchemaInitScript } from "./run-mastra-schema-init.js";
import { runSupabaseCli, runSupabaseCliStreaming } from "./run-supabase-cli.js";
import { runSupabaseSyncScript } from "./run-supabase-sync.js";

/** Shown after a workspace-module install to point at the apply step. */
export const DB_MIGRATE_NEXT_STEP =
  "Migrations aggregated. Run `pnpm engenty db migrate` to apply them to your local database.";

/**
 * The CLI prints its JSON on stdout and notes like "Stopped services: […]" on
 * stderr; `runSupabaseCli` concatenates both, so cut the object out.
 */
export function parseJsonObject<T>(output: string): T | null {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) {
    return null;
  }
  try {
    return JSON.parse(output.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export interface MigrationRow {
  /** Version on disk (the aggregate). */
  local?: string;
  /** Version applied to the database. */
  remote?: string;
}

/**
 * `-o json` is not always honoured — the CLI picks its output format from
 * the terminal it sees and can answer with the markdown table instead — so
 * read both shapes. Local = version on disk, remote = version applied.
 */
export function parseMigrationRows(output: string): MigrationRow[] {
  const json = parseJsonObject<{
    migrations?: Array<{ local?: string; remote?: string }>;
  }>(output);
  if (json?.migrations) {
    return json.migrations;
  }
  const rows: MigrationRow[] = [];
  for (const line of output.split("\n")) {
    if (!line.includes("|")) {
      continue;
    }
    const [local, remote] = line
      .split("|")
      .slice(0, 2)
      .map((cell) => cell.replace(/[`\s]/g, ""));
    if (/^\d+$/.test(local ?? "") || /^\d+$/.test(remote ?? "")) {
      rows.push({
        local: local || undefined,
        remote: remote || undefined,
      });
    }
  }
  return rows;
}

/** Every migration the local database knows about, or null when the CLI fails. */
export function listLocalMigrations(): MigrationRow[] | null {
  const result = runSupabaseCli(["migration", "list", "--local", "-o", "json"]);
  return result.ok ? parseMigrationRows(result.output) : null;
}

/** True when the local database has no migration applied at all. */
export function localDatabaseIsEmpty(): boolean {
  const rows = listLocalMigrations();
  return !rows || rows.every((row) => !row.remote);
}

/**
 * `supabase status` exits 0 only with a stack up; the URL key is spelled
 * `API URL` in the table output and `API_URL` in JSON.
 */
export function isLocalStackRunning(): boolean {
  const result = runSupabaseCli(["status"]);
  return result.ok && /API[ _]URL/.test(result.output);
}

/** Compose `config.toml` from the installed modules and aggregate their SQL. */
export function composeSupabaseConfig(): void {
  const result = runSupabaseSyncScript();
  if (result.output.length > 0) {
    console.log(result.output);
  }
  if (!result.ok) {
    throw new Error("Composing supabase/config.toml failed.");
  }
}

function runSupabaseOrThrow(args: readonly string[]): void {
  const result = runSupabaseCli(args);
  if (result.output.length > 0) {
    console.log(result.output);
  }
  if (!result.ok) {
    throw new Error(`supabase ${args.join(" ")} failed.`);
  }
}

function runSupabaseStreamingOrThrow(args: readonly string[]): void {
  if (!runSupabaseCliStreaming(args).ok) {
    throw new Error(`supabase ${args.join(" ")} failed.`);
  }
}

/**
 * After compose, bridge migrations applied by other worktrees on the shared
 * local Supabase so `migration up` does not fail on remote-only versions.
 */
function runSharedMigrationPlaceholdersStep(): void {
  const cwd = findWorkspaceRootFrom(process.cwd());
  const scriptPath = path.join(
    cwd,
    "scripts",
    "ensure-shared-migration-placeholders.mjs"
  );
  if (!fs.existsSync(scriptPath)) {
    return;
  }
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (output.length > 0) {
    console.log(output);
  }
  if (result.status !== 0) {
    throw new Error("ensure-shared-migration-placeholders failed.");
  }
}

/**
 * Mastra owns its own tables and applies them through its store, not through
 * a .sql file — so this runs alongside the migrations rather than inside
 * them. apps/ai deliberately cannot do it at boot: the DDL reloads
 * PostgREST's schema cache and 502s in-flight requests.
 */
function runMastraSchemaInitStep(): void {
  const result = runMastraSchemaInitScript();
  if (!result.ran) {
    return;
  }
  if (result.output.length > 0) {
    console.log(result.output);
  }
  if (!result.ok) {
    throw new Error("Mastra schema init failed.");
  }
}

/** Compose module migrations, then apply the pending ones locally. */
export function applyLocalDbMigrations(): void {
  composeSupabaseConfig();
  runSharedMigrationPlaceholdersStep();
  runSupabaseStreamingOrThrow(["migration", "up", "--include-all"]);
  runMastraSchemaInitStep();
}

/** Compose, then rebuild the local database from zero. Wipes local data. */
export function resetLocalDb(): void {
  composeSupabaseConfig();
  runSupabaseStreamingOrThrow(["db", "reset"]);
  // A reset drops Mastra's tables with everything else, and nothing
  // recreates them at boot any more.
  runMastraSchemaInitStep();
}

/**
 * Restart the local Supabase stack so PostgREST reloads `config.toml`.
 * Applying a module's migrations creates its tables, but the running API only
 * serves a schema listed in `db-schemas`, which is read at boot — so a newly
 * exposed schema (e.g. `module_contacts` after installing a module) stays
 * unreachable until the stack restarts. `start` is long-running, so stream it.
 */
export function restartLocalDb(): void {
  console.log("Restarting the local Supabase stack to reload exposed schemas…");
  runSupabaseOrThrow(["stop"]);
  runSupabaseStreamingOrThrow(["start"]);
}

export function stopLocalDb(): void {
  runSupabaseStreamingOrThrow(["stop"]);
}

/**
 * True when a local Supabase stack is up and reachable. Used to gate the
 * opt-in `plugins install --db-migrate` convenience so install never fails or
 * mutates a remote/unreachable database — `supabase status` is local-only and
 * exits non-zero when the stack is stopped.
 */
export function isLocalDbReachable(): boolean {
  return runSupabaseCli(["status"]).ok;
}
