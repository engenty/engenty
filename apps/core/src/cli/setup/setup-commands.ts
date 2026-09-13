import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { maybeInstallWorkspacePluginsInteractively } from "../plugins/pick-workspace-plugins.js";
import { requireWorkspaceRoot } from "../workspace.js";
import { generateDerivedArtifacts } from "./run-generate-script.js";
import { runSetup } from "./run-setup.js";

export function registerSetupCommands(program: Command): void {
  program
    .command("setup")
    .description(
      "First run of a checkout (safe to repeat): pick plugins, generate derived files, start Docker + Supabase, apply migrations, write .env.local"
    )
    .option(
      "--refresh",
      "Recreate supabase/config.toml from config.toml.example"
    )
    .option(
      "--no-plugins",
      "Skip the interactive plugin install prompt on a fresh workspace"
    )
    .option(
      "--allow-gaps",
      "Finish with exit 0 even when .env.local still has values that need attention (for example no AI provider key yet)"
    )
    .option(
      "--yes-reset-db",
      "Allow a non-interactive run to destructively `supabase db reset` when the local DB needs init (never implied — must be explicit)"
    )
    .action(
      runCliAction(
        async (options: {
          allowGaps?: boolean;
          plugins?: boolean;
          refresh?: boolean;
          yesResetDb?: boolean;
        }) => {
          const repoRoot = requireWorkspaceRoot("setup");
          // Fresh workspace + interactive TTY → let the user pick which
          // workspace plugins to install before generating artifacts.
          await maybeInstallWorkspacePluginsInteractively({
            repoRoot,
            skip: options.plugins === false,
          });
          await runSetup({
            repoRoot,
            refresh: options.refresh === true,
            allowDbReset: options.yesResetDb === true,
            allowGaps: options.allowGaps === true,
          });
        }
      )
    );

  program
    .command("generate")
    .description(
      "Regenerate the derived files from engenty.plugins: supabase/config.toml, the migrations aggregate, the UI plugin catalog and UI deps. Touches no database and no env file"
    )
    .option(
      "--refresh",
      "Recreate supabase/config.toml from config.toml.example"
    )
    .action(
      runCliAction((options: { refresh?: boolean }) => {
        const repoRoot = requireWorkspaceRoot("generate");
        generateDerivedArtifacts({
          cwd: repoRoot,
          refresh: options.refresh === true,
        });
      })
    );
}
