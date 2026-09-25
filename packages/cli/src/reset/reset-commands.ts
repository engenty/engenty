import { confirm, isCancel } from "@clack/prompts";
import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { resetLocalDb } from "../db/local-db.js";
import { isInteractiveTerminal } from "../select-loop.js";
import { requireWorkspaceRoot, runWorkspaceScript } from "../workspace.js";

/**
 * Back to a fresh checkout: generated files, local env, runtime dirs, build
 * caches and (unless --light) node_modules. The Supabase stack and its data
 * are untouched unless --db is given, and that runs first — `db reset` needs
 * the generated config.toml and migrations aggregate that the purge removes.
 */
export function registerResetCommands(program: Command): void {
  program
    .command("reset")
    .description(
      "Reset the checkout to a fresh-clone state (generated files, local env, caches, node_modules); --db also wipes the local database"
    )
    .option("--light", "Keep node_modules (faster)")
    .option("--db", "Also reset the local database (wipes local data)")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("-q, --quiet", "Less output")
    .action(
      runCliAction(
        async (options: {
          db?: boolean;
          light?: boolean;
          quiet?: boolean;
          yes?: boolean;
        }) => {
          const root = requireWorkspaceRoot("reset");
          let confirmed = options.yes === true;

          if (options.db && !confirmed) {
            if (!isInteractiveTerminal()) {
              throw new Error(
                "engenty reset --db wipes the local database and this is not an interactive terminal. Pass --yes to confirm."
              );
            }
            const answer = await confirm({
              initialValue: false,
              message:
                "Wipe the local database AND reset the checkout (generated files, local env, caches" +
                (options.light ? "" : ", node_modules") +
                ")?",
            });
            if (isCancel(answer) || answer !== true) {
              console.log("Aborted.");
              return;
            }
            confirmed = true;
          }

          if (options.db) {
            // No service-credential re-mint here: the purge below deletes
            // .env.local, and the `engenty setup` that follows mints one.
            resetLocalDb();
          }

          const args = [
            ...(options.light ? ["--light"] : []),
            ...(confirmed ? ["--yes"] : []),
            ...(options.quiet ? ["--quiet"] : []),
          ];
          const status = runWorkspaceScript({
            args,
            cwd: root,
            script: "scripts/purge.sh",
          });
          if (status !== 0) {
            throw new Error("engenty reset failed.");
          }
        }
      )
    );
}
