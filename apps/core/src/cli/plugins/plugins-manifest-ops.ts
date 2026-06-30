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
  resolveEnabledModules,
  resolveModuleDir,
} from "@engenty/environment";
import { runPnpmCommand } from "../run-pnpm-command.js";
import { runSetupScript } from "../setup/run-setup-script.js";

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
      hasUi: moduleHasUi(manifest),
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

  const setup = runSetupScript({ cwd: repoRoot });
  ranSetup = setup.ran;
  if (setup.ran) {
    if (setup.output.length > 0) {
      messages.push(setup.output);
    }
    if (!setup.ok) {
      throw new Error("engenty setup failed.");
    }
    messages.push(
      "Ran engenty setup (supabase config, migrations, UI artifacts, UI deps)."
    );
  }

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

export function checkPluginManifest(repoRoot: string): {
  enabledCount: number;
  errors: string[];
  ok: boolean;
} {
  const errors: string[] = [];
  try {
    const enabled = resolveEnabledModules(repoRoot);
    return { ok: errors.length === 0, errors, enabledCount: enabled.length };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { ok: false, errors, enabledCount: 0 };
  }
}

/** @deprecated Use enablePluginsInProduct */
export function addModuleToManifest(params: {
  repoRoot?: string;
  runInstall?: boolean;
  runSetup?: boolean;
  slug: string;
}) {
  return enablePluginsInProduct({
    ...params,
    slugs: [params.slug],
  });
}

/** @deprecated Use disablePluginsInProduct */
export function removeModuleFromManifest(params: {
  repoRoot?: string;
  runSetup?: boolean;
  slug: string;
}) {
  return disablePluginsInProduct({
    repoRoot: params.repoRoot,
    runSetup: params.runSetup,
    slugs: [params.slug],
  });
}

/** @deprecated Use listPluginManifestEntries */
export function listModuleManifestEntries(repoRoot: string) {
  return listPluginManifestEntries(repoRoot).map((entry) => ({
    slug: entry.slug,
    onDisk: entry.onDisk,
    hasUi: entry.hasUi,
  }));
}

/** @deprecated Use checkPluginManifest */
export function checkModuleManifest(repoRoot: string) {
  return checkPluginManifest(repoRoot);
}
