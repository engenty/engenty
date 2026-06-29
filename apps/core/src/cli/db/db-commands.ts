import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { runSetupScript } from "../setup/run-setup-script.js";
import { runDbSnapshotScript } from "./run-db-snapshot.js";
import { runSupabaseCli } from "./run-supabase-cli.js";
import { runSupabaseSyncScript } from "./run-supabase-sync.js";

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

export function registerDbCommands(program: Command): void {
  const db = program
    .command("db")
    .description("Local database composition and migrations");

  db
    .command("init")
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

  db
    .command("sync")
    .description(
      "Compose supabase/config.toml (API schemas, storage buckets) and aggregate module migrations"
    )
    .action(
      runCliAction(async () => {
        runDbSyncStep();
      })
    );

  db
    .command("migrate")
    .description("Sync module migrations, then apply pending Supabase migrations locally")
    .action(
      runCliAction(async () => {
        runDbSyncStep();
        runSupabaseOrThrow(["migration", "up", "--include-all"]);
      })
    );

  db
    .command("reset")
    .description("Sync module migrations, then reset the local database")
    .action(
      runCliAction(async () => {
        runDbSyncStep();
        runSupabaseOrThrow(["db", "reset"]);
      })
    );

  db
    .command("snapshot")
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

  db
    .command("restore")
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
