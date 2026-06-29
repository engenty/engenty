import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { resolveModulesDir } from "../plugins/discovery.js";
import { runPluginCreatePostSteps } from "./plugin-create/plugin-create-post-steps.js";
import type { PluginCreateAnswers } from "./plugin-create/plugin-create-types.js";
import {
  isValidKebabPluginSlug,
  listExistingModuleSlugs,
} from "./plugin-create/plugin-create-validate.js";
import { defaultAnswersFromSlug } from "./plugin-create/plugin-create-wizard.js";

interface WireUiCliOpts {
  id?: string;
  noInstall?: boolean;
  uiLoad?: string;
}

function printWireUiSummary(params: {
  answers: PluginCreateAnswers;
  moduleRoot: string;
  postSteps: ReturnType<typeof runPluginCreatePostSteps>;
}): void {
  const lines = ["", `UI wiring for ${params.moduleRoot}:`];
  for (const message of params.postSteps.messages) {
    lines.push(`- ${message}`);
  }
  for (const error of params.postSteps.errors) {
    lines.push(`- ${error}`);
  }
  if (params.postSteps.errors.length === 0) {
    lines.push(
      "- Restart apps/core (or pnpm dev:api) if the module is new to the API host"
    );
    lines.push(`- Open /mdl/${params.answers.slug} in the UI app`);
  }
  lines.push("");
  console.log(lines.join("\n"));
}

export function registerPluginWireUiCommand(plugins: Command): void {
  plugins
    .command("wire-ui [name]")
    .description(
      "Wire an existing workspace module into apps/ui (dependency + generate:plugins)"
    )
    .option("--id <slug>", "Module id in kebab-case (alternative to [name])")
    .option(
      "--ui-load <mode>",
      'UI load mode when wiring: "workspace" (default) or "runtime"',
      undefined
    )
    .option(
      "--no-install",
      "Patch apps/ui/package.json only; skip pnpm install and generate:plugins"
    )
    .action((name: string | undefined, opts: WireUiCliOpts) => {
      const modulesDir = resolveModulesDir();
      const slug = (opts.id ?? name ?? "").trim();
      if (!isValidKebabPluginSlug(slug)) {
        console.error(
          "Provide a kebab-case module id via [name] or --id <slug>."
        );
        process.exitCode = 1;
        return;
      }

      const existingSlugs = listExistingModuleSlugs(modulesDir);
      if (!existingSlugs.includes(slug)) {
        console.error(
          `No module at modules/${slug}/. Run plugins create first.`
        );
        process.exitCode = 1;
        return;
      }

      let uiLoad = defaultAnswersFromSlug(slug).uiLoad;
      if (opts.uiLoad === "runtime" || opts.uiLoad === "workspace") {
        uiLoad = opts.uiLoad;
      } else if (opts.uiLoad) {
        console.error('Invalid --ui-load (use "workspace" or "runtime").');
        process.exitCode = 1;
        return;
      }

      const moduleRoot = path.join(modulesDir, slug);
      if (!fs.existsSync(path.join(moduleRoot, "ui", "plugin.ts"))) {
        console.error(
          "Module has no ui/plugin.ts; wire-ui applies to workspace UI modules only."
        );
        process.exitCode = 1;
        return;
      }

      const answers: PluginCreateAnswers = {
        ...defaultAnswersFromSlug(slug),
        slug,
        includeUi: true,
        uiLoad,
      };

      const postSteps = runPluginCreatePostSteps({
        answers,
        modulesDir,
        skipInstall: opts.noInstall === true,
      });

      if (postSteps.errors.length > 0) {
        process.exitCode = 1;
      }

      printWireUiSummary({ answers, moduleRoot, postSteps });
    });
}
