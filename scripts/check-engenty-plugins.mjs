#!/usr/bin/env node
/**
 * CI guard: every engenty.plugins slug must resolve to an on-disk plugin
 * with engenty.plugin.json (top-level module or nested provider), and no
 * module installed at this stage may require one that is left out.
 */
import {
  installModuleStage,
  readEngentyPluginsManifest,
  resolveEnabledModules,
  resolveInstalledModules,
  resolveRepoRoot,
} from "./lib/engenty-modules.mjs";

function main() {
  const repoRoot = resolveRepoRoot();
  const { slugs } = readEngentyPluginsManifest(repoRoot);
  const enabled = resolveEnabledModules(repoRoot, { strict: false });
  const enabledSlugs = new Set(enabled.map((mod) => mod.slug));
  const missing = slugs.filter((slug) => !enabledSlugs.has(slug));
  if (missing.length > 0) {
    console.error(
      `check-engenty-plugins: engenty.plugins lists ${missing.length} plugin(s) not on disk:\n  - ${missing.join("\n  - ")}`
    );
    process.exit(1);
  }
  // Throws with the list when an installed module requires a left-out one.
  const installed = resolveInstalledModules(repoRoot, { strict: false });
  console.log(
    `check-engenty-plugins: ${enabled.length} enabled plugin(s) validated; ${installed.length} installed at stage ${installModuleStage(repoRoot)}.`
  );
}

main();
