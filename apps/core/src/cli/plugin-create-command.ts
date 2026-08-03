import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { resolveModulesDir } from "../plugins/discovery.js";
import { printBanner } from "./banner.js";
import {
  collectPluginScaffoldFiles,
  writePluginScaffold,
} from "./plugin-create/plugin-create-scaffold.js";
import type { PluginCreateAnswers } from "./plugin-create/plugin-create-types.js";
import { listExistingModuleSlugs } from "./plugin-create/plugin-create-validate.js";
import {
  resolveNonInteractivePluginCreate,
  runPluginCreateWizard,
} from "./plugin-create/plugin-create-wizard.js";

interface CreatePluginCliOpts {
  description?: string;
  displayName?: string;
  id?: string;
  noServerRoutes?: boolean;
  noUi?: boolean;
  uiLoad?: string;
  yes?: boolean;
}

function isNonInteractiveEnvironment(): boolean {
  return (
    process.env.CI === "true" || process.env.CI === "1" || !process.stdin.isTTY
  );
}

function printScaffoldSummary(params: {
  answers: PluginCreateAnswers;
  moduleRoot: string;
}): void {
  const { answers, moduleRoot } = params;
  const pkg = `@engenty/${answers.slug}`;
  const lines = [
    "",
    `Scaffold complete: ${moduleRoot}`,
    "",
    "Next steps:",
    `- pnpm engenty plugins enable ${answers.slug}   # activate (manifest + setup)`,
    `- pnpm --filter ${pkg} test`,
  ];

  if (answers.includeUi && answers.uiLoad === "runtime") {
    lines.push(`- pnpm --filter ${pkg} build`);
  }
  if (answers.includeUi) {
    lines.push(
      `- Open /mdl/${answers.slug} after enabling and restarting the API`
    );
  }
  lines.push("");
  console.log(lines.join("\n"));
}

export function registerPluginCreateCommand(plugins: Command): void {
  plugins
    .command("create [name]")
    .description(
      "Scaffold a new first-party module under modules/<id>/ (engenty.plugin.json + src/plugin.ts)"
    )
    .option("--yes", "Non-interactive: apply defaults for omitted options")
    .option("--id <slug>", "Plugin id in kebab-case (alternative to [name])")
    .option("--display-name <name>", "Human-readable module title")
    .option("--description <text>", "Module description for the manifest")
    .option(
      "--ui-load <mode>",
      'When UI is included: "workspace" or "runtime"',
      undefined
    )
    .option("--no-ui", "Scaffold server-only module (no ui/ tree)")
    .option("--no-server-routes", "Skip backend (no HTTP routes or API client)")
    .action(async (name: string | undefined, opts: CreatePluginCliOpts) => {
      const modulesDir = resolveModulesDir();
      const existingSlugs = listExistingModuleSlugs(modulesDir);
      const slugHint = (opts.id ?? name ?? "").trim();
      const hasManualIdentity =
        slugHint.length > 0 && Boolean(opts.displayName?.trim());

      const useResolvedAnswers =
        opts.yes === true || isNonInteractiveEnvironment() || hasManualIdentity;

      let answers: PluginCreateAnswers | "cancelled" | undefined;

      if (useResolvedAnswers) {
        const resolved = resolveNonInteractivePluginCreate({
          description: opts.description,
          displayName: opts.displayName,
          existingSlugs,
          initialSlug: slugHint,
          noServerRoutes: opts.noServerRoutes,
          noUi: opts.noUi,
          uiLoad: opts.uiLoad,
        });
        if (resolved.error) {
          console.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        answers = resolved.value;
      } else {
        printBanner();
        answers = await runPluginCreateWizard({
          existingSlugs,
          initialSlug: slugHint || undefined,
        });
        if (answers === "cancelled") {
          return;
        }
      }

      // `resolveNonInteractivePluginCreate` returns `{ error?, value? }`, so
      // an errorless result with no value is representable — and used to walk
      // straight into `answers.slug`. Say nothing rather than crash.
      if (!answers) {
        return;
      }

      const moduleRoot = path.join(modulesDir, answers.slug);
      if (fs.existsSync(moduleRoot)) {
        console.error(`Refusing to overwrite existing path: ${moduleRoot}`);
        process.exitCode = 1;
        return;
      }

      const files = collectPluginScaffoldFiles(answers);
      writePluginScaffold({ files, moduleRootDir: moduleRoot });

      // create only scaffolds; activation is the explicit `plugins enable` step.
      printScaffoldSummary({ answers, moduleRoot });
    });
}
