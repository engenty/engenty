#!/usr/bin/env node
/**
 * Run the engenty CLI via tsx after ensuring workspace packages are built.
 * `postinstall` normally warms this build, but we re-check here so the CLI also
 * works after a `pnpm engenty reset`, a skipped postinstall, or churned dist.
 */
import { spawnSync } from "node:child_process";
import {
  ensureCliPackagesBuilt,
  ensureCoreDepsBuilt,
  ROOT,
} from "./lib/ensure-cli-build.mjs";
import { shouldDeferPluginBoot } from "./lib/should-defer-plugin-boot.mjs";

const cliArgs = process.argv.slice(2);

try {
  ensureCliPackagesBuilt();
  if (!shouldDeferPluginBoot(["node", "engenty", ...cliArgs])) {
    ensureCoreDepsBuilt();
  }
} catch (err) {
  console.error(err?.message ?? err);
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  ["--filter", "@engenty/core", "exec", "tsx", "src/index.ts", ...cliArgs],
  { cwd: ROOT, stdio: "inherit" }
);

process.exit(result.status ?? 1);
