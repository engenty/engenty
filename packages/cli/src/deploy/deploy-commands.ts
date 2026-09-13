import { spawnSync } from "node:child_process";
import path from "node:path";
import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import {
  cliPackageRoot,
  currentWorkspaceRoot,
  runWorkspaceScript,
} from "../workspace.js";
import { runStandaloneMigrate } from "./migrate.js";

/**
 * The self-host path. The wizard talks to the Supabase Management API and the
 * Coolify API; `migrate` pushes the aggregated module migrations to the
 * deployment's database.
 *
 * Inside a checkout both run the checkout's files (`deploy/.env`,
 * `deploy/scripts/migrate.sh`). Outside — `npx engenty deploy` on a server —
 * the wizard ships with the package and works in `./engenty-deploy`, and
 * `migrate` pushes the release's baked migrations, so the server needs no clone.
 */
export function registerDeployCommands(program: Command): void {
  const deploy = program
    .command("deploy")
    .description(
      "Deploy engenty to a server: the interactive Supabase + Coolify wizard"
    )
    .option("--dry-run", "Show every step without writing or posting anything")
    .option("--no-color", "Plain output")
    .action(
      runCliAction((options: { color?: boolean; dryRun?: boolean }) => {
        const args = [
          ...(options.dryRun ? ["--dry-run"] : []),
          ...(options.color === false ? ["--no-color"] : []),
        ];
        const root = currentWorkspaceRoot();
        const status = root
          ? runWorkspaceScript({
              args,
              cwd: root,
              script: "deploy/scripts/deploy-wizard.mjs",
            })
          : (spawnSync(
              process.execPath,
              [
                path.join(cliPackageRoot(), "wizard", "deploy-wizard.mjs"),
                ...args,
              ],
              { cwd: process.cwd(), stdio: "inherit" }
            ).status ?? 1);
        if (status !== 0) {
          throw new Error("engenty deploy did not finish.");
        }
      })
    );

  deploy
    .command("migrate")
    .description(
      "Apply the release's migrations to the deployment database: in a checkout via `supabase link` + deploy/scripts/migrate.sh, elsewhere via SUPABASE_DB_URL (engenty-deploy/.env or the environment)"
    )
    .action(
      runCliAction(() => {
        const root = currentWorkspaceRoot();
        if (!root) {
          runStandaloneMigrate();
          return;
        }
        const status = runWorkspaceScript({
          cwd: root,
          script: "deploy/scripts/migrate.sh",
        });
        if (status !== 0) {
          throw new Error("engenty deploy migrate failed.");
        }
      })
    );
}
