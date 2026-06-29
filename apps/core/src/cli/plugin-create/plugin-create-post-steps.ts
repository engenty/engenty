import { spawnSync } from "node:child_process";
import type { PluginCreateAnswers } from "./plugin-create-types.js";
import {
  addUiWorkspaceDependency,
  resolveRepoRootFromModulesDir,
  resolveUiPackageJsonPath,
  type UiWorkspaceDependencyWriteResult,
} from "./plugin-create-wire-ui.js";

export interface PluginCreatePostStepResult {
  errors: string[];
  messages: string[];
  ranGeneratePlugins: boolean;
  ranInstall: boolean;
  wiredUiDependency: UiWorkspaceDependencyWriteResult | false;
}

export interface RunPluginCreatePostStepsParams {
  answers: PluginCreateAnswers;
  modulesDir: string;
  runCommand?: typeof runPnpmCommand;
  skipInstall?: boolean;
  skipWireUi?: boolean;
}

export function runPnpmCommand(params: {
  args: readonly string[];
  cwd: string;
}): { ok: boolean; output: string } {
  const result = spawnSync("pnpm", [...params.args], {
    cwd: params.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return {
    ok: result.status === 0,
    output,
  };
}

// TODO(supabase): A new module that declares storage buckets under
// `supabase.storageBuckets` in its engenty.plugin.json must run
// `pnpm supabase:sync` (scripts/supabase-sync.mjs) to compose the managed
// `[storage.buckets.*]` block in supabase/config.toml. We intentionally do NOT
// run it here yet — wire it into the post-steps if/when plugin-create starts
// scaffolding bucket declarations.
export function runPluginCreatePostSteps(
  params: RunPluginCreatePostStepsParams
): PluginCreatePostStepResult {
  const result: PluginCreatePostStepResult = {
    errors: [],
    messages: [],
    ranGeneratePlugins: false,
    ranInstall: false,
    wiredUiDependency: false,
  };

  const shouldWireUi =
    !params.skipWireUi &&
    params.answers.includeUi &&
    params.answers.uiLoad === "workspace";

  if (!shouldWireUi) {
    return result;
  }

  const packageName = `@engenty/${params.answers.slug}`;
  const repoRootDir = resolveRepoRootFromModulesDir(params.modulesDir);
  const uiPackageJsonPath = resolveUiPackageJsonPath(repoRootDir);
  const runCommand = params.runCommand ?? runPnpmCommand;

  result.wiredUiDependency = addUiWorkspaceDependency({
    packageName,
    uiPackageJsonPath,
  });

  if (result.wiredUiDependency === "missing-ui-app") {
    result.errors.push(
      `Could not find apps/ui/package.json at ${uiPackageJsonPath}. Add "${packageName}": "workspace:*" manually, then run pnpm install and pnpm --filter @engenty/ui generate:plugins.`
    );
    return result;
  }

  if (result.wiredUiDependency === "added") {
    result.messages.push(
      `Added ${packageName} to apps/ui/package.json dependencies.`
    );
  } else {
    result.messages.push(
      `${packageName} is already listed in apps/ui/package.json.`
    );
  }

  if (params.skipInstall) {
    result.messages.push(
      "Skipped pnpm install (pass without --no-install to link the workspace package and regenerate UI artifacts)."
    );
    return result;
  }

  const install = runCommand({
    args: ["install"],
    cwd: repoRootDir,
  });
  result.ranInstall = true;
  if (!install.ok) {
    result.errors.push(
      install.output.length > 0
        ? `pnpm install failed:\n${install.output}`
        : "pnpm install failed."
    );
    return result;
  }
  result.messages.push("Ran pnpm install.");

  const generate = runCommand({
    args: ["--filter", "@engenty/ui", "generate:plugins"],
    cwd: repoRootDir,
  });
  result.ranGeneratePlugins = true;
  if (!generate.ok) {
    result.errors.push(
      generate.output.length > 0
        ? `pnpm --filter @engenty/ui generate:plugins failed:\n${generate.output}`
        : "pnpm --filter @engenty/ui generate:plugins failed."
    );
    return result;
  }
  result.messages.push(
    "Ran pnpm --filter @engenty/ui generate:plugins (commit generated-catalog.ts and generated-tailwind-sources.css when they change)."
  );

  return result;
}
