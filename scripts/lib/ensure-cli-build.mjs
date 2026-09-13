/**
 * Shared build warm-up used by both the postinstall hook and the engenty CLI
 * wrapper. Fresh installs (or `pnpm engenty reset`) only have source — `dist/` is
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
  // The command implementations (setup, dev, db, env, doctor, deploy, …);
  // depends on @engenty/environment, hence the order.
  { filter: "@engenty/cli", marker: "packages/cli/dist/index.js" },
];

// A core infrastructure dependency (not a plugin). Its presence is the proxy
// for "core's workspace deps are built". Plugins load from source via jiti and
// never need a dist build.
export const CORE_BOOT_MARKER = "packages/plugin-sdk/dist/index.js";

function markerExists(marker) {
  return fs.existsSync(path.join(ROOT, marker));
}

// A dist that exists is not a dist that is current: after `git pull` the
// source moved on and the marker still passes. The commit the last build ran
// at is stamped here; a different HEAD means "rebuild" — through turbo, so
// packages whose inputs did not change are cache hits, not rebuilds.
// Two stamps, because deferred commands (env, doctor, plugins, …) build only
// the CLI packages and must not claim core's dependencies are current.
const CLI_BUILD_STAMP = path.join(ROOT, ".engenty", "cli-build.sha");
const CORE_DEPS_BUILD_STAMP = path.join(
  ROOT,
  ".engenty",
  "core-deps-build.sha"
);

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function readBuildStamp(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
}

function writeBuildStamp(file, head) {
  if (!head) {
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${head}\n`);
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

/**
 * Build the always-needed CLI packages if their dist is missing, or refresh
 * them (turbo, cached) when the checkout moved since the last build.
 */
export function ensureCliPackagesBuilt() {
  const head = currentHead();
  const missing = CLI_PACKAGE_BUILDS.filter(
    ({ marker }) => !markerExists(marker)
  );
  if (missing.length === 0) {
    if (!head || readBuildStamp(CLI_BUILD_STAMP) === head) {
      return false;
    }
    runPnpmBuild(
      ["exec", "turbo", "run", "build", "--filter=@engenty/cli..."],
      "Checkout changed since the last build — refreshing the engenty CLI…"
    );
    writeBuildStamp(CLI_BUILD_STAMP, head);
    return true;
  }
  runPnpmBuild(
    [...missing.flatMap(({ filter }) => ["--filter", filter]), "build"],
    "Building CLI workspace packages…"
  );
  writeBuildStamp(CLI_BUILD_STAMP, head);
  return true;
}

/**
 * Build `@engenty/core`'s workspace dependencies if they are missing, or
 * rebuild them (turbo, cached) when the checkout moved since the last build.
 */
export function ensureCoreDepsBuilt() {
  const head = currentHead();
  if (markerExists(CORE_BOOT_MARKER)) {
    if (!head || readBuildStamp(CORE_DEPS_BUILD_STAMP) === head) {
      return false;
    }
    runPnpmBuild(
      ["exec", "turbo", "run", "build", "--filter=@engenty/core^..."],
      "Checkout changed since the last build — refreshing @engenty/core dependencies…"
    );
    writeBuildStamp(CORE_DEPS_BUILD_STAMP, head);
    return true;
  }
  runPnpmBuild(
    ["--filter", "@engenty/core^...", "build"],
    "Building @engenty/core dependencies…"
  );
  writeBuildStamp(CORE_DEPS_BUILD_STAMP, head);
  return true;
}
