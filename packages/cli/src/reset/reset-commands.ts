import { confirm, isCancel, multiselect } from "@clack/prompts";
import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { resetLocalDb } from "../db/local-db.js";
import { isInteractiveTerminal } from "../select-loop.js";
import { requireWorkspaceRoot, runWorkspaceScript } from "../workspace.js";
import { backupEnvFiles } from "./backup-env-files.js";

/**
 * Back to a fresh checkout: generated files, local env, runtime dirs, build
 * caches and (unless --light) node_modules. The Supabase stack and its data
 * are untouched unless --db is given, and that runs first — `db reset` needs
 * the generated config.toml and migrations aggregate that the purge removes.
 * --bak copies the env files to `<name>.bak` first. With no option given, an
 * interactive terminal picks them from a checklist.
 */
export function registerResetCommands(program: Command): void {
  program
    .command("reset")
    .description(
      "Reset the checkout to a fresh-clone state (generated files, local env, caches, node_modules); --db also wipes the local database"
    )
    .option("--light", "Keep node_modules (faster)")
    .option("--db", "Also reset the local database (wipes local data)")
    .option(
      "--bak",
      "Back up .env files to .env*.bak first (kept through the reset)"
    )
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("-q, --quiet", "Less output")
    .action(
      runCliAction(
        async (options: {
          bak?: boolean;
          db?: boolean;
          light?: boolean;
          quiet?: boolean;
          yes?: boolean;
        }) => {
          const root = requireWorkspaceRoot("reset");
          let confirmed = options.yes === true;

          const noOptions = !(options.db || options.light || options.bak);
          if (noOptions && !confirmed && isInteractiveTerminal()) {
            const picked = await multiselect({
              initialValues: ["bak", "modules"],
              message: "Reset the checkout — what should it do?",
              options: [
                {
                  hint: "keys and dev credentials survive as .env*.bak",
                  label: "Back up .env files",
                  value: "bak",
                },
                {
                  hint: "needs pnpm install afterwards",
                  label: "Delete node_modules",
                  value: "modules",
                },
                {
                  hint: "wipes local data",
                  label: "Reset the local database",
                  value: "db",
                },
              ],
              required: false,
            });
            if (isCancel(picked)) {
              console.log("Aborted.");
              return;
            }
            options.bak = picked.includes("bak");
            options.light = !picked.includes("modules");
            options.db = picked.includes("db");
            const answer = await confirm({
              initialValue: false,
              message: "Run the reset now? This cannot be undone.",
            });
            if (isCancel(answer) || answer !== true) {
              console.log("Aborted.");
              return;
            }
            confirmed = true;
          }

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

          if (options.bak) {
            const saved = backupEnvFiles(root);
            console.log(
              saved.length > 0
                ? `Backed up ${saved.map((f) => `${f}.bak`).join(", ")}`
                : "No env files to back up."
            );
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
