#!/usr/bin/env node
/**
 * Remove pro-only plugin slugs from package.json engenty.plugins.
 * Used on the public publish branch so CI plugins:check matches the open tree.
 */
import { CLOSED_PLUGIN_SLUGS } from "./lib/closed-paths.mjs";
import {
  disablePluginsInManifest,
  readEngentyPluginsManifest,
  resolveRepoRoot,
} from "./lib/engenty-modules.mjs";

const repoRoot = resolveRepoRoot();
const { slugs } = readEngentyPluginsManifest(repoRoot);
const toRemove = CLOSED_PLUGIN_SLUGS.filter((slug) => slugs.includes(slug));

if (toRemove.length === 0) {
  console.log("strip-closed-plugins-manifest: nothing to remove.");
  process.exit(0);
}

disablePluginsInManifest(repoRoot, toRemove);
console.log(
  `strip-closed-plugins-manifest: removed ${toRemove.length} closed plugin(s):\n  - ${toRemove.join("\n  - ")}`
);
