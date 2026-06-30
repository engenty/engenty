#!/usr/bin/env node
/**
 * Composes module-owned Supabase config from what's installed on disk:
 * - `[api].schemas` from CREATE SCHEMA in aggregated migrations (base schemas only in git)
 * - `[storage.buckets.*]` from engenty.plugin.json → supabase.storageBuckets (empty in git)
 * - SQL migrations aggregated into supabase/migrations (gitignored)
 *
 * Local supabase/config.toml is gitignored — materialize from config.toml.example via pnpm engenty setup.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enabledModuleSlugSet } from "./lib/engenty-modules.mjs";
import {
  composeApiSchemas,
  syncApiSchemasInConfigToml,
  syncStorageBucketsInConfigToml,
} from "./supabase-sync-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function ensureLocalSupabaseConfig(root) {
  const configPath = path.join(root, "supabase", "config.toml");
  if (fs.existsSync(configPath)) {
    return;
  }
  const examplePath = path.join(root, "supabase", "config.toml.example");
  if (!fs.existsSync(examplePath)) {
    throw new Error(
      `Missing ${configPath}. Run pnpm engenty setup or copy supabase/config.toml.example.`
    );
  }
  fs.copyFileSync(examplePath, configPath);
}

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

function discoverBucketOwners(parentDir, enabledModuleSlugs) {
  if (!(fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory())) {
    return [];
  }
  const owners = [];
  for (const ent of fs.readdirSync(parentDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) {
      continue;
    }
    if (
      parentDir.endsWith(`${path.sep}modules`) &&
      enabledModuleSlugs &&
      !enabledModuleSlugs.has(ent.name)
    ) {
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
  const enabledModuleSlugs = enabledModuleSlugSet(root);
  const owners = [
    ...discoverBucketOwners(path.join(root, "apps")),
    ...discoverBucketOwners(path.join(root, "packages")),
    ...discoverBucketOwners(path.join(root, "modules"), enabledModuleSlugs),
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

function writeConfigTomlIfChanged(configPath, next) {
  const original = fs.readFileSync(configPath, "utf-8");
  if (next === original) {
    return false;
  }
  fs.writeFileSync(configPath, next, "utf-8");
  return true;
}

function syncConfigToml(root, composedBuckets) {
  const configPath = path.join(root, "supabase", "config.toml");
  if (!fs.existsSync(configPath)) {
    throw new Error(`supabase/config.toml not found at ${configPath}`);
  }
  const original = fs.readFileSync(configPath, "utf-8");
  const next = syncStorageBucketsInConfigToml(original, composedBuckets.blocks);
  return writeConfigTomlIfChanged(configPath, next);
}

function syncApiSchemas(root) {
  const configPath = path.join(root, "supabase", "config.toml");
  if (!fs.existsSync(configPath)) {
    throw new Error(`supabase/config.toml not found at ${configPath}`);
  }
  const migrationsDir = path.join(root, "supabase", "migrations");
  const schemas = composeApiSchemas(migrationsDir);
  const original = fs.readFileSync(configPath, "utf-8");
  const next = syncApiSchemasInConfigToml(original, schemas);
  return { changed: writeConfigTomlIfChanged(configPath, next), schemas };
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
  ensureLocalSupabaseConfig(root);

  const composedBuckets = composeBuckets(root);
  const bucketsChanged = syncConfigToml(root, composedBuckets);

  execFileSync(
    process.execPath,
    [path.join(SCRIPT_DIR, "aggregate-module-migrations.mjs")],
    { cwd: root, stdio: "inherit" }
  );

  const { changed: schemasChanged, schemas } = syncApiSchemas(root);
  const migrationCount = countAggregatedMigrations(root);
  const configChanged = bucketsChanged || schemasChanged;

  console.log(
    `supabase:sync: composed ${composedBuckets.bucketCount} bucket(s) from ${composedBuckets.moduleCount} module(s);` +
      ` exposed ${schemas.length} api schema(s)` +
      `${configChanged ? "" : " (config.toml unchanged)"};` +
      ` ${migrationCount} migration(s) aggregated.`
  );
}

main();
