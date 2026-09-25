import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { ensureLocalServiceCredential } from "../setup/local-service-credential-step.js";
import { requireWorkspaceRoot, runWorkspaceScript } from "../workspace.js";
import {
  applyLocalDbMigrations,
  resetLocalDb,
  restartLocalDb,
  stopLocalDb,
} from "./local-db.js";
import { runDbSnapshotScript } from "./run-db-snapshot.js";
import { runSupabaseCliStreaming } from "./run-supabase-cli.js";

function runSnapshotAction(params: {
  action: "snapshot" | "restore";
  file?: string;
}): void {
  const result = runDbSnapshotScript(params);
  if (result.output.length > 0) {
    console.log(result.output);
  }
  if (!result.ok) {
    throw new Error(`db ${params.action} failed.`);
  }
}

export function registerDbCommands(program: Command): void {
  const db = program
    .command("db")
    .description(
      "The local Supabase stack: start, stop, migrate, reset, snapshot"
    );

  db.command("up")
    .description(
      "Start the local Supabase stack — lean by default (no Studio, no log pipeline)"
    )
    .option("--studio", "Also start Supabase Studio (the DB browser UI)")
    .option(
      "--logs",
      "Also start the Logflare/Vector log pipeline (Studio's Logs tab)"
    )
    .action(
      runCliAction((options: { logs?: boolean; studio?: boolean }) => {
        const root = requireWorkspaceRoot("db up");
        const args = [
          ...(options.studio ? ["--studio"] : []),
          ...(options.logs ? ["--logs"] : []),
        ];
        const status = runWorkspaceScript({
          args,
          cwd: root,
          script: "scripts/db-up.mjs",
        });
        if (status !== 0) {
          throw new Error("supabase start failed.");
        }
      })
    );

  db.command("down")
    .description("Stop the local Supabase stack (data is kept)")
    .action(
      runCliAction(() => {
        requireWorkspaceRoot("db down");
        stopLocalDb();
      })
    );

  db.command("status")
    .description("Show the local Supabase stack's URLs and keys")
    .action(
      runCliAction(() => {
        requireWorkspaceRoot("db status");
        if (!runSupabaseCliStreaming(["status"]).ok) {
          throw new Error(
            "The local Supabase stack is not running. Start it with: pnpm engenty db up"
          );
        }
      })
    );

  db.command("restart")
    .description(
      "Restart the local Supabase stack so the API reloads exposed schemas from config.toml"
    )
    .action(
      runCliAction(() => {
        requireWorkspaceRoot("db restart");
        restartLocalDb();
      })
    );

  db.command("migrate")
    .description(
      "Compose module migrations, then apply the pending ones to the local database (includes Mastra's schema)"
    )
    .action(
      runCliAction(() => {
        requireWorkspaceRoot("db migrate");
        applyLocalDbMigrations();
      })
    );

  db.command("reset")
    .description(
      "Compose module migrations, then rebuild the local database from zero — wipes local data"
    )
    .action(
      runCliAction(() => {
        const root = requireWorkspaceRoot("db reset");
        resetLocalDb();
        // The reset dropped core.service_credential: re-mint the AI service's
        // credential so .env.local's ENGENTY_AI_SERVICE_SECRET names a live row.
        ensureLocalServiceCredential({ workspaceRoot: root });
      })
    );

  db.command("snapshot")
    .description(
      "Dump local Postgres data (developer schemas) to supabase/snapshots/"
    )
    .action(
      runCliAction(() => {
        requireWorkspaceRoot("db snapshot");
        runSnapshotAction({ action: "snapshot" });
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
      runCliAction((file: string | undefined) => {
        requireWorkspaceRoot("db restore");
        runSnapshotAction({
          action: "restore",
          file: file?.trim() || undefined,
        });
      })
    );
}
