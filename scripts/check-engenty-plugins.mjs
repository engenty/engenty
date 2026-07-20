#!/usr/bin/env node
/**
 * CI guard: every engenty.plugins slug must resolve to an on-disk plugin
 * with engenty.plugin.json (top-level module or nested provider).
 */
import {
  readEngentyPluginsManifest,
  resolveEnabledModules,
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
  console.log(
    `check-engenty-plugins: ${enabled.length} enabled plugin(s) validated.`
  );
}

main();
