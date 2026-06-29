#!/usr/bin/env node
import { createHash } from "node:crypto";
/**
 * Aggregates owned SQL migrations (apps/core + modules/packages) into root supabase/migrations.
 * Run from repo root. Idempotent: only writes when content would change.
 * Fails on duplicate output filenames across sources or invalid timestamps.
 */
import fs from "node:fs";
import path from "node:path";
import { enabledModuleSlugSet } from "./lib/engenty-modules.mjs";

const TIMESTAMP_REGEX = /^(\d{14})_(.+)\.sql$/;
const PLUGIN_SLUG_PREFIX = "plugin_";

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

function readPackageJson(dir) {
  const p = path.join(dir, "package.json");
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function discoverMigrationOwners(parentDir, ownerKind, enabledModuleSlugs) {
  if (!(fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory())) {
    return [];
  }
  const entries = fs.readdirSync(parentDir, { withFileTypes: true });
  const owners = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) {
      continue;
    }
    if (
      ownerKind === "module" &&
      parentDir.endsWith(`${path.sep}modules`) &&
      enabledModuleSlugs &&
      !enabledModuleSlugs.has(ent.name)
    ) {
      continue;
    }
    const ownerDir = path.join(parentDir, ent.name);
    const pkg = readPackageJson(ownerDir);
    if (!pkg) {
      continue;
    }
    const migrationsDir = pkg.engenty?.migrationsDir ?? "supabase/migrations";
    const migrationsPath = path.resolve(ownerDir, migrationsDir);
    if (
      !(
        fs.existsSync(migrationsPath) &&
        fs.statSync(migrationsPath).isDirectory()
      )
    ) {
      continue;
    }
    owners.push({
      kind: ownerKind,
      name: ent.name,
      packageName: pkg.name,
      migrationsPath,
    });
  }
  return owners.sort((a, b) => a.name.localeCompare(b.name));
}

function validateTimestamp(basename, ownerLabel) {
  const m = basename.match(TIMESTAMP_REGEX);
  if (!m) {
    throw new Error(
      `Invalid migration filename in ${ownerLabel}: "${basename}". Expected YYYYMMDDHHMMSS_<slug>.sql`
    );
  }
  const [, ts] = m;
  const num = Number(ts);
  if (Number.isNaN(num) || ts.length !== 14) {
    throw new Error(
      `Invalid timestamp in ${ownerLabel}: "${basename}". Expected 14 digits.`
    );
  }
}

function validatePluginBasename(basename, ownerName) {
  validateTimestamp(basename, `module ${ownerName}`);
  const slug = basename.match(TIMESTAMP_REGEX)[2];
  if (!slug.startsWith(PLUGIN_SLUG_PREFIX)) {
    throw new Error(
      `Module migration filename in ${ownerName} must start with ${PLUGIN_SLUG_PREFIX}: "${basename}". Use YYYYMMDDHHMMSS_plugin_<slug>.sql`
    );
  }
}

function validateCoreBasename(basename, ownerName) {
  if (basename === "00000000000001_initial_schema.sql") {
    return;
  }
  validateTimestamp(basename, `app ${ownerName}`);
  const slug = basename.match(TIMESTAMP_REGEX)[2];
  if (slug.startsWith(PLUGIN_SLUG_PREFIX)) {
    throw new Error(
      `Core migration filename in ${ownerName} must not use ${PLUGIN_SLUG_PREFIX}: "${basename}".`
    );
  }
}

function collectMigrations(owners) {
  const byBasename = new Map();
  const list = [];
  for (const owner of owners) {
    const files = fs
      .readdirSync(owner.migrationsPath)
      .filter((f) => f.endsWith(".sql"));
    for (const basename of files.sort()) {
      if (owner.kind === "core") {
        validateCoreBasename(basename, owner.name);
      } else {
        validatePluginBasename(basename, owner.name);
      }
      const existing = byBasename.get(basename);
      if (existing) {
        throw new Error(
          `Duplicate migration basename "${basename}" from "${existing}" and "${owner.kind}:${owner.name}". Rename one.`
        );
      }
      byBasename.set(basename, `${owner.kind}:${owner.name}`);
      list.push({
        ownerKind: owner.kind,
        ownerName: owner.name,
        basename,
        sourcePath: path.join(owner.migrationsPath, basename),
      });
    }
  }
  return list;
}

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function buildOutputContent(sourceContent, ownerKind, ownerName, basename) {
  const contentHash = sha256(sourceContent);
  const sourceLabel = ownerKind === "core" ? "core" : "module";
  const header = [
    `-- aggregated from ${sourceLabel}: ${ownerName}`,
    `-- source: ${basename}`,
    `-- content-sha256: ${contentHash}`,
    "",
  ].join("\n");
  return header + sourceContent;
}

function isAggregatedMigration(content) {
  return (
    content.startsWith("-- aggregated from module:") ||
    content.startsWith("-- aggregated from core:")
  );
}

function main() {
  const root = resolveRepoRoot();
  const appsDir = path.join(root, "apps");
  const modulesDir = path.join(root, "modules");
  const packagesDir = path.join(root, "packages");
  const outDir = path.join(root, "supabase", "migrations");

  const enabledModuleSlugs = enabledModuleSlugSet(root);

  const owners = [
    ...discoverMigrationOwners(appsDir, "core"),
    ...discoverMigrationOwners(modulesDir, "module", enabledModuleSlugs),
    ...discoverMigrationOwners(packagesDir, "module", enabledModuleSlugs),
  ];
  if (owners.length === 0) {
    return;
  }

  const migrations = collectMigrations(owners);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const expectedBasenames = new Set(migrations.map((m) => m.basename));

  let written = 0;
  for (const { ownerKind, ownerName, basename, sourcePath } of migrations) {
    const sourceContent = fs.readFileSync(sourcePath, "utf-8");
    const outputContent = buildOutputContent(
      sourceContent,
      ownerKind,
      ownerName,
      basename
    );
    const outPath = path.join(outDir, basename);

    let existing = "";
    if (fs.existsSync(outPath)) {
      existing = fs.readFileSync(outPath, "utf-8");
    }
    if (existing !== outputContent) {
      fs.writeFileSync(outPath, outputContent, "utf-8");
      written += 1;
    }
  }

  let pruned = 0;
  if (fs.existsSync(outDir)) {
    for (const entry of fs.readdirSync(outDir)) {
      if (!entry.endsWith(".sql")) {
        continue;
      }
      if (expectedBasenames.has(entry)) {
        continue;
      }
      const outPath = path.join(outDir, entry);
      const content = fs.readFileSync(outPath, "utf-8");
      if (entry.includes("_plugin_") || isAggregatedMigration(content)) {
        fs.unlinkSync(outPath);
        pruned += 1;
      }
    }
  }

  if (written > 0 || pruned > 0) {
    const parts = [];
    if (written > 0) {
      parts.push(`wrote ${written} migration(s)`);
    }
    if (pruned > 0) {
      parts.push(`pruned ${pruned} stale migration(s)`);
    }
    console.log(`aggregate-module-migrations: ${parts.join(", ")}`);
  }
}

main();
