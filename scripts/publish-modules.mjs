#!/usr/bin/env node
/**
 * Publish workspace modules to the registry (GitHub Packages, @engenty scope) —
 * Level A / A5, "modules as overlays" (Option B).
 *
 * A published module is installed ON TOP of a running platform that already
 * provides the internal @engenty/* packages, so those deps are rewritten to
 * peerDependencies (host-provided) rather than shipped as hard deps. Third-party
 * deps stay real dependencies. The transform runs against a STAGED copy of each
 * package.json — the committed source is never mutated (local dev keeps its
 * workspace deps).
 *
 * Usage:
 *   node scripts/publish-modules.mjs --version=0.1.45          # publish
 *   node scripts/publish-modules.mjs --version=0.1.45 --dry-run # stage + pack, no publish
 *
 * Auth (real publish): a registry token in the environment, wired by the CI
 * workflow via ~/.npmrc (`//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}`).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  resolveEnabledModules,
  resolveRepoRoot,
} from "./lib/engenty-modules.mjs";

export const REGISTRY = "https://npm.pkg.github.com";

/**
 * Pure transform: the package.json a module publishes with. Exported for tests.
 * - drops `private` (the local accidental-publish guard)
 * - stamps the release `version` (lockstep with the platform)
 * - moves internal @engenty/* deps → peerDependencies (host-provided overlay)
 * - keeps third-party deps as real dependencies
 * - drops devDependencies (irrelevant to consumers)
 * - pins the registry via publishConfig
 */
export function transformModuleManifestForPublish(pkg, { version } = {}) {
  const out = { ...pkg };
  delete out.private;
  if (version) {
    out.version = version;
  }
  const deps = out.dependencies ?? {};
  const peers = { ...(out.peerDependencies ?? {}) };
  const runtimeDeps = {};
  for (const [name, range] of Object.entries(deps)) {
    if (name.startsWith("@engenty/")) {
      // Host-provided at whatever lockstep version the platform ships.
      peers[name] = "*";
    } else {
      runtimeDeps[name] = range;
    }
  }
  if (Object.keys(runtimeDeps).length > 0) {
    out.dependencies = runtimeDeps;
  } else {
    delete out.dependencies;
  }
  if (Object.keys(peers).length > 0) {
    out.peerDependencies = peers;
  }
  delete out.devDependencies;
  out.publishConfig = { ...(out.publishConfig ?? {}), registry: REGISTRY };
  return out;
}

function parseArgs(argv) {
  const args = { dryRun: false, version: "" };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg.startsWith("--version=")) {
      args.version = arg.slice("--version=".length).trim();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function publishModule(mod, { version, dryRun }) {
  const pkgPath = path.join(mod.dir, "package.json");
  const original = fs.readFileSync(pkgPath, "utf-8");
  const transformed = transformModuleManifestForPublish(JSON.parse(original), {
    version,
  });
  const summary = {
    slug: mod.slug,
    version: transformed.version,
    deps: Object.keys(transformed.dependencies ?? {}).length,
    peers: Object.keys(transformed.peerDependencies ?? {}).length,
  };
  // Stage the transformed manifest in place, then restore no matter what.
  try {
    fs.writeFileSync(pkgPath, `${JSON.stringify(transformed, null, 2)}\n`);
    if (dryRun) {
      execFileSync("npm", ["publish", "--dry-run", "--registry", REGISTRY], {
        cwd: mod.dir,
        stdio: "ignore",
      });
    } else {
      execFileSync("npm", ["publish", "--registry", REGISTRY], {
        cwd: mod.dir,
        stdio: "inherit",
      });
    }
  } finally {
    fs.writeFileSync(pkgPath, original);
  }
  return summary;
}

function main() {
  const { dryRun, version } = parseArgs(process.argv.slice(2));
  if (!(version || dryRun)) {
    throw new Error("--version=<x.y.z> is required for a real publish");
  }
  const root = resolveRepoRoot();
  // Option B publishes the leaf modules, not the internal platform packages.
  const modules = resolveEnabledModules(root, { strict: false }).filter(
    (mod) => mod.source === "workspace"
  );
  const results = [];
  for (const mod of modules) {
    results.push(publishModule(mod, { version, dryRun }));
  }
  const label = dryRun ? "staged (dry-run)" : "published";
  for (const r of results) {
    console.log(
      `${label} @engenty/${r.slug}@${r.version}  deps=${r.deps} peers=${r.peers}`
    );
  }
  console.log(`\npublish-modules: ${label} ${results.length} module(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
