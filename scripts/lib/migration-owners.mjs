#!/usr/bin/env node
/**
 * Who owns SQL migrations in this workspace: apps/* (core), enabled modules/*
 * and packages/* (plugins), plus registry modules installed into node_modules.
 *
 * Shared by the aggregator (which copies their SQL into supabase/migrations)
 * and by the API-schema composer, which reads the same SQL straight from the
 * committed sources — so a fresh clone can answer "which schemas does this
 * install expose?" without a database, an install, or a generated config.toml.
 */
import fs from "node:fs";
import path from "node:path";
import {
  enabledModuleSlugSet,
  readEngentyPluginsManifest,
  resolveEnabledModules,
} from "./engenty-modules.mjs";

export function resolveRepoRoot() {
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

function readManifestId(dir) {
  const p = path.join(dir, "engenty.plugin.json");
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    const id = JSON.parse(fs.readFileSync(p, "utf-8")).id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

export function discoverMigrationOwners(
  parentDir,
  ownerKind,
  enabledModuleSlugs
) {
  if (!(fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory())) {
    return [];
  }
  const isModulesParent =
    ownerKind === "module" && parentDir.endsWith(`${path.sep}modules`);
  const owners = [];
  const addOwner = (ownerDir, name) => {
    const pkg = readPackageJson(ownerDir);
    if (!pkg) {
      return;
    }
    const migrationsDir = pkg.engenty?.migrationsDir ?? "supabase/migrations";
    const migrationsPath = path.resolve(ownerDir, migrationsDir);
    if (
      !(
        fs.existsSync(migrationsPath) &&
        fs.statSync(migrationsPath).isDirectory()
      )
    ) {
      return;
    }
    owners.push({
      kind: ownerKind,
      name,
      packageName: pkg.name,
      migrationsPath,
    });
  };

  for (const ent of fs.readdirSync(parentDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) {
      continue;
    }
    const ownerDir = path.join(parentDir, ent.name);
    if (
      !(
        isModulesParent &&
        enabledModuleSlugs &&
        !enabledModuleSlugs.has(ent.name)
      )
    ) {
      addOwner(ownerDir, ent.name);
    }
    if (!isModulesParent) {
      continue;
    }
    const providersDir = path.join(ownerDir, "providers");
    if (
      !(fs.existsSync(providersDir) && fs.statSync(providersDir).isDirectory())
    ) {
      continue;
    }
    for (const child of fs.readdirSync(providersDir, { withFileTypes: true })) {
      if (!child.isDirectory()) {
        continue;
      }
      const childDir = path.join(providersDir, child.name);
      const slug = readManifestId(childDir);
      if (!slug) {
        continue;
      }
      if (enabledModuleSlugs && !enabledModuleSlugs.has(slug)) {
        continue;
      }
      addOwner(childDir, slug);
    }
  }
  return owners.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Level A: migration owners for modules installed from the registry
 * (node_modules). Their SQL ships in the tarball under the same migrationsDir
 * convention, so they aggregate identically to workspace modules.
 */
export function discoverRegistryMigrationOwners(root) {
  const owners = [];
  for (const mod of resolveEnabledModules(root, { strict: false })) {
    if (mod.source !== "registry") {
      continue;
    }
    const pkg = readPackageJson(mod.dir);
    if (!pkg) {
      continue;
    }
    const migrationsDir = pkg.engenty?.migrationsDir ?? "supabase/migrations";
    const migrationsPath = path.resolve(mod.dir, migrationsDir);
    if (
      fs.existsSync(migrationsPath) &&
      fs.statSync(migrationsPath).isDirectory()
    ) {
      owners.push({
        kind: "module",
        name: mod.slug,
        packageName: pkg.name,
        migrationsPath,
      });
    }
  }
  return owners.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every migration owner this workspace ships, in aggregation order.
 *
 * Registry modules live in node_modules, so a checkout that has not been
 * installed yet simply contributes none of them — callers that must know
 * compare against `readEngentyPluginsManifest`.
 */
export function resolveMigrationOwners(root) {
  const { plugins } = readEngentyPluginsManifest(root);
  // Workspace scans must exclude registry-source modules — those are owned by
  // discoverRegistryMigrationOwners (from node_modules), and a leftover
  // modules/<slug> checkout would otherwise duplicate them.
  const enabledModuleSlugs = new Set(
    [...enabledModuleSlugSet(root)].filter(
      (slug) => plugins[slug]?.source !== "registry"
    )
  );

  return [
    ...discoverMigrationOwners(path.join(root, "apps"), "core"),
    ...discoverMigrationOwners(
      path.join(root, "modules"),
      "module",
      enabledModuleSlugs
    ),
    ...discoverMigrationOwners(
      path.join(root, "packages"),
      "module",
      enabledModuleSlugs
    ),
    ...discoverRegistryMigrationOwners(root),
  ];
}
