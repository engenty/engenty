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
 * - tags `engenty.tier` ("open" | "pro") so the entitlement layer (manage app)
 *   can gate pro modules at enable-time; the registry itself is a coarse gate.
 */
export function transformModuleManifestForPublish(pkg, { version, tier } = {}) {
  const out = { ...pkg };
  out.private = undefined;
  if (version) {
    out.version = version;
  }
  if (tier) {
    out.engenty = { ...(out.engenty ?? {}), tier };
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
  out.dependencies =
    Object.keys(runtimeDeps).length > 0 ? runtimeDeps : undefined;
  if (Object.keys(peers).length > 0) {
    out.peerDependencies = peers;
  }
  out.devDependencies = undefined;
  out.publishConfig = { ...(out.publishConfig ?? {}), registry: REGISTRY };
  return out;
}

/**
 * Read the CLOSED_PREFIXES bash array from scripts/publish-open.sh — the single
 * source of truth for pro-only paths (also used by the public-mirror sync).
 * Parsing it here avoids a second, driftable copy of the list.
 */
export function readClosedPrefixes(repoRoot) {
  const src = fs.readFileSync(
    path.join(repoRoot, "scripts", "publish-open.sh"),
    "utf-8"
  );
  const lines = src.split("\n");
  const start = lines.findIndex((line) => line.includes("CLOSED_PREFIXES=("));
  if (start === -1) {
    throw new Error("CLOSED_PREFIXES not found in scripts/publish-open.sh");
  }
  // Read until the closing paren on its own line — a regex up to the first `)`
  // truncates on the `)` inside the array's comments. Only entries are quoted.
  const prefixes = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\)/.test(lines[i])) {
      break;
    }
    for (const match of lines[i].matchAll(/"([^"]+)"/g)) {
      prefixes.push(match[1]);
    }
  }
  return prefixes;
}

/**
 * "pro" if the module's repo-relative dir is under a closed prefix, else "open".
 * Pure/exported for tests.
 */
export function moduleTier(relDir, closedPrefixes) {
  const normalized = relDir.split(path.sep).join("/");
  const isClosed = closedPrefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
  return isClosed ? "pro" : "open";
}

function parseArgs(argv) {
  const args = { dryRun: false, version: "", includePro: false };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--pro") {
      args.includePro = true;
    } else if (arg.startsWith("--version=")) {
      args.version = arg.slice("--version=".length).trim();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

/** GitHub Packages 403 "You have exceeded a secondary rate limit". */
export function isSecondaryRateLimit(output) {
  return /secondary rate limit/i.test(output ?? "");
}

/** npm's "this exact name@version is already on the registry" refusal. */
export function isAlreadyPublished(output) {
  const text = output ?? "";
  return (
    /EPUBLISHCONFLICT/.test(text) ||
    /cannot publish over(?: the)? previously published version/i.test(text)
  );
}

const RATE_LIMIT_RETRIES = 5;
const RATE_LIMIT_BACKOFF_MS = [30_000, 60_000, 120_000, 240_000, 300_000];

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * One `npm publish`, made safe to re-run.
 *
 * Publishing ~33 packages back-to-back trips GitHub Packages' SECONDARY rate
 * limit (a 403, not a 429) — that killed v0.1.95 at package 26 of 33, leaving
 * the registry half-published with no way to finish: the script had no retry,
 * and a plain re-run died on the first already-published package. So:
 *   - a secondary-rate-limit 403 backs off and retries instead of failing;
 *   - an already-published version is a SKIP, not an error, so re-running the
 *     same version completes the tail rather than starting over.
 * Anything else still throws — a real publish failure must stay loud.
 */
function npmPublish(cwd, args) {
  for (let attempt = 0; ; attempt++) {
    try {
      execFileSync("npm", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      return "published";
    } catch (error) {
      const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
      if (isAlreadyPublished(output)) {
        return "skipped";
      }
      if (isSecondaryRateLimit(output) && attempt < RATE_LIMIT_RETRIES) {
        const wait = RATE_LIMIT_BACKOFF_MS[attempt];
        console.log(
          `  secondary rate limit — waiting ${wait / 1000}s, retry ${attempt + 1}/${RATE_LIMIT_RETRIES}`
        );
        sleepSync(wait);
        continue;
      }
      process.stderr.write(output);
      throw error;
    }
  }
}

function publishModule(mod, { version, dryRun, tier }) {
  const pkgPath = path.join(mod.dir, "package.json");
  const original = fs.readFileSync(pkgPath, "utf-8");
  const transformed = transformModuleManifestForPublish(JSON.parse(original), {
    version,
    tier,
  });
  const summary = {
    slug: mod.slug,
    version: transformed.version,
    tier,
    deps: Object.keys(transformed.dependencies ?? {}).length,
    peers: Object.keys(transformed.peerDependencies ?? {}).length,
  };
  // Stage the transformed manifest in place, then restore no matter what.
  try {
    fs.writeFileSync(pkgPath, `${JSON.stringify(transformed, null, 2)}\n`);
    const args = dryRun
      ? ["publish", "--dry-run", "--registry", REGISTRY]
      : ["publish", "--registry", REGISTRY];
    summary.outcome = npmPublish(mod.dir, args);
  } finally {
    fs.writeFileSync(pkgPath, original);
  }
  // Print as we go: a run that dies partway must still say what landed.
  console.log(
    `${summary.outcome} [${tier}] ${transformed.name}@${transformed.version}`
  );
  return summary;
}

function main() {
  const { dryRun, version, includePro } = parseArgs(process.argv.slice(2));
  if (!(version || dryRun)) {
    throw new Error("--version=<x.y.z> is required for a real publish");
  }
  const root = resolveRepoRoot();
  const closedPrefixes = readClosedPrefixes(root);
  // Option B publishes the leaf modules, not the internal platform packages.
  // Each module carries its tier (open/pro) from CLOSED_PREFIXES. Default is
  // OPEN ONLY (safe — e.g. a public/community feed); pass --pro to also include
  // pro modules (the release workflow does, so the private @engenty registry
  // gets both — pro modules are then gated at enable-time by the manage app).
  const all = resolveEnabledModules(root, { strict: false })
    .filter((mod) => mod.source === "workspace")
    .map((mod) => ({
      ...mod,
      tier: moduleTier(path.relative(root, mod.dir), closedPrefixes),
    }));
  const modules = all.filter((mod) => includePro || mod.tier !== "pro");
  const skipped = all.length - modules.length;

  const results = [];
  for (const mod of modules) {
    results.push(publishModule(mod, { version, dryRun, tier: mod.tier }));
  }
  const label = dryRun ? "staged (dry-run)" : "published";
  const alreadyThere = results.filter((r) => r.outcome === "skipped").length;
  const proCount = results.filter((r) => r.tier === "pro").length;
  console.log(
    `\npublish-modules: ${label} ${results.length} module(s) ` +
      `(${results.length - proCount} open, ${proCount} pro)` +
      (alreadyThere > 0
        ? ` — ${alreadyThere} already on the registry at this version`
        : "") +
      (skipped > 0 ? ` — skipped ${skipped} pro (pass --pro to include)` : "")
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
