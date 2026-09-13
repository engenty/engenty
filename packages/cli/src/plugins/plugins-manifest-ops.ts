import fs from "node:fs";
import {
  disablePluginsInManifest,
  ENGENTY_PLUGIN_MANIFEST,
  enablePluginsInManifest,
  findEngentyRepoRootFrom,
  listWorkspaceModuleSlugsOnDisk,
  moduleHasUi,
  readEngentyPluginsManifest,
  readPluginManifest,
  resolveModuleDir,
} from "@engenty/environment";
import { runPnpmCommand } from "../run-pnpm-command.js";
import { runGenerateScript } from "../setup/run-generate-script.js";

export interface PluginManifestEntry {
  enabled: boolean;
  hasUi: boolean;
  onDisk: boolean;
  slug: string;
}

export function resolveRepoRoot(startDir = process.cwd()): string {
  return findEngentyRepoRootFrom(startDir);
}

function validatePluginOnDisk(repoRoot: string, slug: string): void {
  const dir = resolveModuleDir(repoRoot, slug);
  if (!fs.existsSync(dir)) {
    throw new Error(
      `modules/${slug}/ is missing on disk — copy or scaffold the plugin first`
    );
  }
  const manifest = readPluginManifest(dir);
  if (!manifest) {
    throw new Error(`modules/${slug}/ is missing ${ENGENTY_PLUGIN_MANIFEST}`);
  }
}

export function listPluginManifestEntries(
  repoRoot: string
): PluginManifestEntry[] {
  const { slugs } = readEngentyPluginsManifest(repoRoot);
  const enabled = new Set(slugs);
  const slugsOnDisk = listWorkspaceModuleSlugsOnDisk(repoRoot);
  const allSlugs = [...new Set([...slugsOnDisk, ...slugs])].sort();

  return allSlugs.map((slug) => {
    const dir = resolveModuleDir(repoRoot, slug);
    const onDisk = fs.existsSync(dir);
    const manifest = onDisk ? readPluginManifest(dir) : null;
    return {
      slug,
      onDisk,
      enabled: enabled.has(slug),
      hasUi: moduleHasUi(manifest, onDisk ? dir : undefined),
    };
  });
}

function runSetupAfterManifestChange(
  repoRoot: string,
  runInstall: boolean
): { messages: string[]; ranInstall: boolean; ranSetup: boolean } {
  const messages: string[] = [];
  let ranInstall = false;
  let ranSetup = false;

  if (runInstall) {
    const install = runPnpmCommand({ args: ["install"], cwd: repoRoot });
    ranInstall = true;
    if (!install.ok) {
      throw new Error(
        install.output.length > 0
          ? `pnpm install failed:\n${install.output}`
          : "pnpm install failed."
      );
    }
    messages.push("Ran pnpm install.");
  }

  const generate = runGenerateScript({ cwd: repoRoot });
  ranSetup = true;
  if (generate.output.length > 0) {
    messages.push(generate.output);
  }
  if (!generate.ok) {
    throw new Error("engenty generate failed.");
  }
  messages.push(
    "Ran engenty generate (supabase config, migrations, UI artifacts, UI deps)."
  );

  return { messages, ranInstall, ranSetup };
}

export function enablePluginsInProduct(params: {
  repoRoot?: string;
  runInstall?: boolean;
  runSetup?: boolean;
  slugs: string[];
}): {
  messages: string[];
  ranInstall: boolean;
  ranSetup: boolean;
} {
  const repoRoot = params.repoRoot ?? resolveRepoRoot();
  const slugs = params.slugs.map((slug) => slug.trim()).filter(Boolean);
  if (slugs.length === 0) {
    throw new Error("Provide at least one plugin slug to enable.");
  }

  for (const slug of slugs) {
    validatePluginOnDisk(repoRoot, slug);
  }

  const before = new Set(readEngentyPluginsManifest(repoRoot).slugs);
  const toEnable = slugs.filter((slug) => !before.has(slug));
  if (toEnable.length === 0) {
    return {
      messages: slugs.map(
        (slug) => `"${slug}" is already enabled in engenty.plugins.`
      ),
      ranInstall: false,
      ranSetup: false,
    };
  }

  enablePluginsInManifest(repoRoot, toEnable);

  const messages = toEnable.map(
    (slug) => `Enabled "${slug}" in engenty.plugins.`
  );
  if (params.runSetup === false) {
    return { messages, ranInstall: false, ranSetup: false };
  }

  const setup = runSetupAfterManifestChange(
    repoRoot,
    params.runInstall !== false
  );
  return {
    messages: [...messages, ...setup.messages],
    ranInstall: setup.ranInstall,
    ranSetup: setup.ranSetup,
  };
}

export function disablePluginsInProduct(params: {
  repoRoot?: string;
  runSetup?: boolean;
  slugs: string[];
}): { messages: string[]; ranSetup: boolean } {
  const repoRoot = params.repoRoot ?? resolveRepoRoot();
  const slugs = params.slugs.map((slug) => slug.trim()).filter(Boolean);
  if (slugs.length === 0) {
    throw new Error("Provide at least one plugin slug to disable.");
  }

  const before = new Set(readEngentyPluginsManifest(repoRoot).slugs);
  const toDisable = slugs.filter((slug) => before.has(slug));
  if (toDisable.length === 0) {
    return {
      messages: slugs.map(
        (slug) => `"${slug}" is not enabled in engenty.plugins.`
      ),
      ranSetup: false,
    };
  }

  disablePluginsInManifest(repoRoot, toDisable);

  const messages = toDisable.map(
    (slug) =>
      `Disabled "${slug}" in engenty.plugins (module folder left on disk).`
  );
  if (params.runSetup === false) {
    return { messages, ranSetup: false };
  }

  const setup = runSetupAfterManifestChange(repoRoot, false);
  return {
    messages: [...messages, ...setup.messages],
    ranSetup: setup.ranSetup,
  };
}

// Validation check (not the runtime resolver): every enabled manifest slug
// must be a workspace plugin present on disk with a plugin manifest, mirroring
// scripts/check-engenty-plugins.mjs. This is deliberately STRICT — unlike
// `resolveEnabledModules`, which soft-skips not-on-disk plugins so an open
// worktree that lists closed plugins can still boot. Don't delegate this to the
// resolver, or missing plugins go unreported.
export function checkPluginManifest(repoRoot: string): {
  enabledCount: number;
  errors: string[];
  ok: boolean;
} {
  const errors: string[] = [];
  const { plugins, slugs } = readEngentyPluginsManifest(repoRoot);
  const onDisk = new Set(listWorkspaceModuleSlugsOnDisk(repoRoot));
  let enabledCount = 0;

  for (const slug of slugs) {
    const spec = plugins[slug];
    if (!spec) {
      continue;
    }
    if (spec.source !== "workspace") {
      errors.push(
        `engenty.plugins.${slug} uses source "${spec.source}" — only workspace plugins are supported in v1`
      );
      continue;
    }
    if (!onDisk.has(slug)) {
      errors.push(
        `modules/${slug}/ is missing on disk — copy or scaffold the plugin first`
      );
      continue;
    }
    if (!readPluginManifest(resolveModuleDir(repoRoot, slug))) {
      errors.push(`modules/${slug}/ is missing ${ENGENTY_PLUGIN_MANIFEST}`);
      continue;
    }
    enabledCount += 1;
  }

  return { ok: errors.length === 0, errors, enabledCount };
}
