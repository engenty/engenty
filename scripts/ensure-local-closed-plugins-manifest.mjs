#!/usr/bin/env node
/**
 * After merging upstream into pro, re-enable closed plugins that exist on disk
 * so a public package.json strip cannot drop them from engenty-pro.
 */
import { CLOSED_PLUGIN_SLUGS } from "./lib/closed-plugin-slugs.mjs";
import {
  enablePluginsInManifest,
  listWorkspaceModuleSlugsOnDisk,
  readEngentyPluginsManifest,
  resolveRepoRoot,
} from "./lib/engenty-modules.mjs";

const repoRoot = resolveRepoRoot();
const onDisk = new Set(listWorkspaceModuleSlugsOnDisk(repoRoot));
const { slugs } = readEngentyPluginsManifest(repoRoot);
const missing = CLOSED_PLUGIN_SLUGS.filter(
  (slug) => onDisk.has(slug) && !slugs.includes(slug)
);

if (missing.length === 0) {
  console.log("ensure-local-closed-plugins-manifest: already complete.");
  process.exit(0);
}

enablePluginsInManifest(repoRoot, missing);
console.log(
  `ensure-local-closed-plugins-manifest: re-enabled ${missing.length} closed plugin(s):\n  - ${missing.join("\n  - ")}`
);
