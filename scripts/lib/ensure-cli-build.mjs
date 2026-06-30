/**
 * Shared build warm-up used by both the postinstall hook and the engenty CLI
 * wrapper. Fresh installs (or `pnpm purge`) only have source — `dist/` is
 * produced from it. Keeping this in one place stops the two entry points from
 * drifting.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

// Always-needed CLI packages: `apps/core`'s entry imports these statically, so
// they must be built for any command (even deferred ones like `env`/`plugins`).
export const CLI_PACKAGE_BUILDS = [
  {
    filter: "@engenty/environment",
    marker: "packages/environment/dist/env.js",
  },
  { filter: "@engenty/telemetry", marker: "packages/telemetry/dist/index.js" },
];

// A core infrastructure dependency (not a plugin). Its presence is the proxy
// for "core's workspace deps are built". Plugins load from source via jiti and
// never need a dist build.
export const CORE_BOOT_MARKER = "packages/plugin-sdk/dist/index.js";

function markerExists(marker) {
  return fs.existsSync(path.join(ROOT, marker));
}

function runPnpmBuild(args, label) {
  console.log(label);
  const result = spawnSync("pnpm", args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(
      `\`pnpm ${args.join(" ")}\` failed with exit code ${result.status ?? 1}`
    );
  }
}

/** Build the always-needed CLI packages if their dist is missing. */
export function ensureCliPackagesBuilt() {
  const missing = CLI_PACKAGE_BUILDS.filter(
    ({ marker }) => !markerExists(marker)
  );
  if (missing.length === 0) {
    return false;
  }
  runPnpmBuild(
    [...missing.flatMap(({ filter }) => ["--filter", filter]), "build"],
    "Building CLI workspace packages…"
  );
  return true;
}

/** Build `@engenty/core`'s workspace dependencies if they are missing. */
export function ensureCoreDepsBuilt() {
  if (markerExists(CORE_BOOT_MARKER)) {
    return false;
  }
  runPnpmBuild(
    ["--filter", "@engenty/core^...", "build"],
    "Building @engenty/core dependencies…"
  );
  return true;
}
