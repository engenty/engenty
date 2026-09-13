import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import {
  requireWorkspaceRoot,
  runPnpmInWorkspace,
  runWorkspaceScript,
} from "../workspace.js";

/**
 * The daily start. Preflight (Docker, the Supabase stack and its health,
 * pending migrations, generated files, stale dev ports) lives in
 * `scripts/predev-check.sh` and runs here and only here — `engenty setup`
 * deliberately does none of it.
 */
export function registerDevCommands(program: Command): void {
  program
    .command("dev")
    .description(
      "Start the local dev stack: preflight, build packages and modules, then core + ui + ai + docs"
    )
    .option(
      "--portless",
      "Serve behind the Portless HTTPS gateway (https://engenty.localhost)"
    )
    .option(
      "--domain <name>",
      "Portless domain for this checkout, https://<name>.engenty.localhost (implies --portless)"
    )
    .option("--studio", "Also start Mastra Studio")
    .option(
      "--no-preflight",
      "Skip the preflight (Docker, Supabase, migrations, generated files, ports)"
    )
    .action(
      runCliAction(
        (options: {
          domain?: string;
          portless?: boolean;
          preflight?: boolean;
          studio?: boolean;
        }) => {
          const root = requireWorkspaceRoot("dev");

          if (options.preflight !== false) {
            const check = runWorkspaceScript({
              cwd: root,
              script: "scripts/predev-check.sh",
            });
            if (check !== 0) {
              process.exitCode = check;
              return;
            }
          }

          const build = runPnpmInWorkspace(root, [
            "exec",
            "turbo",
            "run",
            "build",
            "--filter=./packages/*",
            "--filter=./modules/**",
          ]);
          if (build !== 0) {
            process.exitCode = build;
            return;
          }

          const studio = options.studio ? ["--studio"] : [];
          const status =
            options.portless || options.domain
              ? runWorkspaceScript({
                  args: [
                    ...(options.domain ? [`--domain=${options.domain}`] : []),
                    ...studio,
                  ],
                  cwd: root,
                  script: "scripts/dev-portless.sh",
                })
              : runWorkspaceScript({
                  args: studio,
                  cwd: root,
                  script: "scripts/dev.sh",
                });
          process.exitCode = status;
        }
      )
    );
}
