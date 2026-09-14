import fs from "node:fs";
import path from "node:path";
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
/**
 * `.env.local` carries one generated dev-URL block, and the UI is built with
 * the AI URL from it. A Portless block under plain `pnpm dev` (or the
 * reverse) sends the browser to a host that is not serving this checkout —
 * the copilot then reports "could not reach the AI service".
 */
function warnOnDevUrlShape(
  root: string,
  portless: boolean,
  domain?: string
): void {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const line = fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith("VITE_ENGENTY_AI_BASE_URL="));
  const value = line?.slice("VITE_ENGENTY_AI_BASE_URL=".length).trim() ?? "";
  if (!value) {
    return;
  }
  const isPortless = value.startsWith("https://");
  if (isPortless === portless) {
    return;
  }
  const fix = portless
    ? `pnpm dev:urls:portless${domain ? ` --domain=${domain}` : ""}`
    : "pnpm dev:urls:localhost";
  console.warn(
    `\n.env.local has ${isPortless ? "Portless (https://*.localhost)" : "localhost"} dev URLs, but you are starting ${portless ? "pnpm dev:portless" : "pnpm dev"}. The UI would call the AI service at ${value}. Fix: ${fix}\n`
  );
}

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
          warnOnDevUrlShape(
            root,
            Boolean(options.portless || options.domain),
            options.domain
          );

          if (options.preflight !== false) {
            const check = runWorkspaceScript({
              args: options.domain ? [`--domain=${options.domain}`] : [],
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
