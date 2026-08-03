import { findWorkspaceRootFrom } from "@engenty/environment/env";
import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { maybeInstallWorkspacePluginsInteractively } from "../plugins/pick-workspace-plugins.js";
import { runLocalSetup } from "./run-local-setup.js";
import { runSetupScript } from "./run-setup-script.js";

async function runSetup(refresh: boolean): Promise<void> {
  const result = runSetupScript({ refresh });
  if (result.output.length > 0) {
    console.log(result.output);
  }
  if (!result.ran) {
    console.log(
      "Skipped setup: scripts/setup.mjs not found in workspace root."
    );
    return;
  }
  if (!result.ok) {
    throw new Error("setup failed.");
  }
}

export function registerSetupCommands(program: Command): void {
  program
    .command("setup")
    .description(
      "Generate local supabase/config.toml, aggregated migrations, and UI plugin artifacts from engenty.plugins"
    )
    .option(
      "--refresh",
      "Recreate supabase/config.toml from config.toml.example"
    )
    .option(
      "--local",
      "First-run orchestration: setup, start Supabase, apply migrations, then print next steps"
    )
    .option(
      "--no-plugins",
      "Skip the interactive plugin install prompt on a fresh workspace"
    )
    .option(
      "--yes-reset-db",
      "Allow a non-interactive run to destructively `supabase db reset` when the local DB needs init (never implied — must be explicit)"
    )
    .action(
      runCliAction(
        async (options: {
          local?: boolean;
          plugins?: boolean;
          refresh?: boolean;
          yesResetDb?: boolean;
        }) => {
          const repoRoot = findWorkspaceRootFrom(process.cwd());
          // Fresh workspace + interactive TTY → let the user pick which
          // workspace plugins to install before composing artifacts.
          await maybeInstallWorkspacePluginsInteractively({
            repoRoot,
            skip: options.plugins === false,
          });
          if (options.local === true) {
            await runLocalSetup({
              repoRoot,
              refresh: options.refresh === true,
              allowDbReset: options.yesResetDb === true,
            });
            return;
          }
          await runSetup(options.refresh === true);
        }
      )
    );

  program
    .command("init")
    .description("Deprecated — use engenty setup --local")
    .option(
      "--refresh",
      "Recreate supabase/config.toml from config.toml.example"
    )
    .action(
      runCliAction(async (options: { refresh?: boolean }) => {
        console.warn(
          "engenty init is deprecated — use: pnpm engenty setup --local"
        );
        const repoRoot = findWorkspaceRootFrom(process.cwd());
        await runLocalSetup({
          repoRoot,
          refresh: options.refresh === true,
        });
      })
    );
}
