import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { requireWorkspaceRoot, runWorkspaceScript } from "../workspace.js";

/**
 * The self-host path. The wizard talks to the Supabase Management API and the
 * Coolify API; `migrate` pushes the aggregated module migrations to the linked
 * Supabase project. Both scripts live under deploy/ and run from the checkout.
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
        const root = requireWorkspaceRoot("deploy");
        const args = [
          ...(options.dryRun ? ["--dry-run"] : []),
          ...(options.color === false ? ["--no-color"] : []),
        ];
        const status = runWorkspaceScript({
          args,
          cwd: root,
          script: "deploy/scripts/deploy-wizard.mjs",
        });
        if (status !== 0) {
          throw new Error("engenty deploy did not finish.");
        }
      })
    );

  deploy
    .command("migrate")
    .description(
      "Apply the aggregated module migrations to the linked Supabase project (supabase link first)"
    )
    .action(
      runCliAction(() => {
        const root = requireWorkspaceRoot("deploy migrate");
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
