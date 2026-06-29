#!/usr/bin/env node
/**
 * CI guard: every engenty.plugins slug must exist on disk with engenty.plugin.json.
 */
import {
  readEngentyPluginsManifest,
  resolveEnabledModules,
  resolveRepoRoot,
} from "./lib/engenty-modules.mjs";

function main() {
  const repoRoot = resolveRepoRoot();
  readEngentyPluginsManifest(repoRoot);
  const enabled = resolveEnabledModules(repoRoot);
  console.log(
    `check-engenty-plugins: ${enabled.length} enabled plugin(s) validated.`
  );
}

main();
