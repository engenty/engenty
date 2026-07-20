import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findWorkspaceRootFrom } from "@engenty/environment/env";
import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { runSetupScript } from "../setup/run-setup-script.js";
import { runDbSnapshotScript } from "./run-db-snapshot.js";
import { runSupabaseCli, runSupabaseCliStreaming } from "./run-supabase-cli.js";
import { runSupabaseSyncScript } from "./run-supabase-sync.js";

/** Shown after a workspace-module install to point at the apply step. */
export const DB_MIGRATE_NEXT_STEP =
  "Migrations aggregated. Run `pnpm db:migrate` to apply them to your local database.";

function runDbSyncStep(): void {
  const result = runSupabaseSyncScript();
  if (!result.ran) {
    console.log(
      "Skipped db sync: scripts/supabase-sync.mjs or supabase/config.toml.example not found in workspace root."
    );
    return;
  }
  if (result.output.length > 0) {
    console.log(result.output);
  }
  if (!result.ok) {
    throw new Error("db sync failed.");
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

/** Compose module migrations, then apply pending Supabase migrations locally. */
export function applyLocalDbMigrations(): void {
  runDbSyncStep();
  runSharedMigrationPlaceholdersStep();
  runSupabaseOrThrow(["migration", "up", "--include-all"]);
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
  if (!runSupabaseCliStreaming(["start"]).ok) {
    throw new Error("supabase start failed.");
  }
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

export function registerDbCommands(program: Command): void {
  const db = program
    .command("db")
    .description("Local database composition and migrations");

  db.command("init")
    .description(
      "Run engenty setup, then reset the local database and apply aggregated migrations"
    )
    .action(
      runCliAction(async () => {
        const setup = runSetupScript();
        if (setup.output.length > 0) {
          console.log(setup.output);
        }
        if (setup.ran && !setup.ok) {
          throw new Error("setup failed.");
        }
        runSupabaseOrThrow(["db", "reset"]);
      })
    );

  db.command("sync")
    .description(
      "Compose supabase/config.toml (API schemas, storage buckets) and aggregate module migrations"
    )
    .action(
      runCliAction(async () => {
        runDbSyncStep();
      })
    );

  db.command("migrate")
    .description(
      "Sync module migrations, then apply pending Supabase migrations locally"
    )
    .action(
      runCliAction(async () => {
        applyLocalDbMigrations();
      })
    );

  db.command("reset")
    .description("Sync module migrations, then reset the local database")
    .action(
      runCliAction(async () => {
        runDbSyncStep();
        runSupabaseOrThrow(["db", "reset"]);
      })
    );

  db.command("restart")
    .description(
      "Restart the local Supabase stack so the API reloads exposed schemas from config.toml"
    )
    .action(
      runCliAction(async () => {
        restartLocalDb();
      })
    );

  db.command("snapshot")
    .description(
      "Dump local Postgres data (developer schemas) to supabase/snapshots/"
    )
    .action(
      runCliAction(async () => {
        const result = runDbSnapshotScript({ action: "snapshot" });
        if (!result.ran) {
          console.log(
            "Skipped db snapshot: scripts/db-snapshot.mjs not found in workspace root."
          );
          return;
        }
        if (result.output.length > 0) {
          console.log(result.output);
        }
        if (!result.ok) {
          throw new Error("db snapshot failed.");
        }
      })
    );

  db.command("restore")
    .description(
      "Reset the local database, then restore data from a snapshot (latest if omitted)"
    )
    .argument(
      "[file]",
      "Snapshot file name in supabase/snapshots/, or path to a .sql dump"
    )
    .action(
      runCliAction(async (file: string | undefined) => {
        const result = runDbSnapshotScript({
          action: "restore",
          file: file?.trim() || undefined,
        });
        if (!result.ran) {
          console.log(
            "Skipped db restore: scripts/db-snapshot.mjs not found in workspace root."
          );
          return;
        }
        if (result.output.length > 0) {
          console.log(result.output);
        }
        if (!result.ok) {
          throw new Error("db restore failed.");
        }
      })
    );
}
