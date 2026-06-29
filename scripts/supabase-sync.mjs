#!/usr/bin/env node
/**
 * Composes module-owned Supabase storage buckets into supabase/config.toml,
 * then aggregates owned SQL migrations into supabase/migrations.
 *
 * Buckets are declared per-module in engenty.plugin.json under
 * `supabase.storageBuckets`. This script scans apps/*, packages/* and modules/*
 * present on disk, renders a [storage.buckets.<name>] block for each, and writes
 * them between the managed markers in config.toml:
 *
 *   # >>> engenty:storage-buckets (managed by `pnpm supabase:sync` — do not edit by hand)
 *   # <<< engenty:storage-buckets
 *
 * Run from repo root. Idempotent: only writes config.toml when content changes.
 * Then runs scripts/aggregate-module-migrations.mjs so `supabase:sync` is a
 * single sweep: compose buckets + aggregate migrations from what's installed.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER_BEGIN =
  "# >>> engenty:storage-buckets (managed by `pnpm supabase:sync` — do not edit by hand)";
const MARKER_END = "# <<< engenty:storage-buckets";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 20; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (
          Array.isArray(pkg.workspaces) &&
          pkg.workspaces.includes("modules/*")
        ) {
          return dir;
        }
      } catch {
        // ignore
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return process.cwd();
}

function readPluginManifest(dir) {
  const p = path.join(dir, "engenty.plugin.json");
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function discoverBucketOwners(parentDir) {
  if (!(fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory())) {
    return [];
  }
  const owners = [];
  for (const ent of fs.readdirSync(parentDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) {
      continue;
    }
    const manifest = readPluginManifest(path.join(parentDir, ent.name));
    const buckets = manifest?.supabase?.storageBuckets;
    if (!Array.isArray(buckets) || buckets.length === 0) {
      continue;
    }
    owners.push({ name: ent.name, buckets });
  }
  return owners;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlStringArray(values) {
  return `[${values.map((v) => tomlString(v)).join(", ")}]`;
}

function renderBucketBlock(bucket) {
  const lines = [`[storage.buckets.${bucket.name}]`];
  lines.push(`public = ${bucket.public === true ? "true" : "false"}`);
  if (bucket.fileSizeLimit !== undefined && bucket.fileSizeLimit !== null) {
    lines.push(`file_size_limit = ${tomlString(bucket.fileSizeLimit)}`);
  }
  if (Array.isArray(bucket.allowedMimeTypes)) {
    lines.push(
      `allowed_mime_types = ${tomlStringArray(bucket.allowedMimeTypes)}`
    );
  }
  return lines.join("\n");
}

function composeBuckets(root) {
  const owners = [
    ...discoverBucketOwners(path.join(root, "apps")),
    ...discoverBucketOwners(path.join(root, "packages")),
    ...discoverBucketOwners(path.join(root, "modules")),
  ];

  const all = [];
  const byName = new Map();
  for (const owner of owners) {
    for (const bucket of owner.buckets) {
      if (!bucket?.name) {
        throw new Error(
          `Module "${owner.name}" has a supabase.storageBuckets entry without a "name".`
        );
      }
      const prev = byName.get(bucket.name);
      if (prev) {
        throw new Error(
          `Duplicate storage bucket "${bucket.name}" declared by "${prev}" and "${owner.name}".`
        );
      }
      byName.set(bucket.name, owner.name);
      all.push({ owner: owner.name, bucket });
    }
  }

  all.sort((a, b) => a.bucket.name.localeCompare(b.bucket.name));
  return {
    moduleCount: owners.length,
    bucketCount: all.length,
    blocks: all.map((b) => renderBucketBlock(b.bucket)),
  };
}

function syncConfigToml(root, composed) {
  const configPath = path.join(root, "supabase", "config.toml");
  if (!fs.existsSync(configPath)) {
    throw new Error(`supabase/config.toml not found at ${configPath}`);
  }
  const original = fs.readFileSync(configPath, "utf-8");

  const beginIdx = original.indexOf(MARKER_BEGIN);
  const endIdx = original.indexOf(MARKER_END);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    throw new Error(
      `Managed storage-bucket markers not found in supabase/config.toml. Expected:\n${MARKER_BEGIN}\n${MARKER_END}`
    );
  }

  const before = original.slice(0, beginIdx + MARKER_BEGIN.length);
  const after = original.slice(endIdx);

  const middle =
    composed.blocks.length > 0 ? `\n${composed.blocks.join("\n\n")}\n` : "\n";

  const next = `${before}${middle}${after}`;
  if (next !== original) {
    fs.writeFileSync(configPath, next, "utf-8");
    return true;
  }
  return false;
}

function countAggregatedMigrations(root) {
  const outDir = path.join(root, "supabase", "migrations");
  if (!fs.existsSync(outDir)) {
    return 0;
  }
  return fs.readdirSync(outDir).filter((f) => f.endsWith(".sql")).length;
}

function main() {
  const root = resolveRepoRoot();

  const composed = composeBuckets(root);
  const changed = syncConfigToml(root, composed);

  // Aggregate migrations in the same sweep.
  execFileSync(
    process.execPath,
    [path.join(SCRIPT_DIR, "aggregate-module-migrations.mjs")],
    { cwd: root, stdio: "inherit" }
  );

  const migrationCount = countAggregatedMigrations(root);

  console.log(
    `supabase:sync: composed ${composed.bucketCount} bucket(s) from ${composed.moduleCount} module(s)` +
      `${changed ? "" : " (config.toml unchanged)"}; ${migrationCount} migration(s) aggregated.`
  );
}

main();
