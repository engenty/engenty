#!/usr/bin/env node
/**
 * Sync apps/ui/package.json workspace deps for declared engenty.plugins with UI.
 */
import fs from "node:fs";
import path from "node:path";
import { moduleTier, tryReadClosedPrefixes } from "./closed-prefixes.mjs";
import {
  listWorkspaceModulesOnDisk,
  resolveEnabledModules,
  resolveRepoRoot,
} from "./engenty-modules.mjs";

const MODULE_DEP_PREFIX = "@engenty/";

/** Legacy apps/ui shell imports — kept until copilot is fully plugin-only. */
const UI_SHELL_PINNED_MODULE_DEPS = [
  "@engenty/engenty-copilot",
  // Settings shell imports company profile form sections directly.
  "@engenty/company-profile",
];

/**
 * More removals than this in one run is a detection failure, not a product
 * change. Disabling a handful of modules by hand still passes.
 */
const BULK_REMOVAL_LIMIT = 3;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function listModulePackageNames(repoRoot) {
  const names = new Set();
  for (const { dir } of listWorkspaceModulesOnDisk(repoRoot)) {
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) {
      continue;
    }
    const pkg = readJson(pkgPath);
    if (
      typeof pkg.name === "string" &&
      pkg.name.startsWith(MODULE_DEP_PREFIX)
    ) {
      names.add(pkg.name);
    }
  }
  return names;
}

export function syncUiModuleDependencies(repoRoot = resolveRepoRoot()) {
  const uiPackageJsonPath = path.join(repoRoot, "apps/ui/package.json");
  if (!fs.existsSync(uiPackageJsonPath)) {
    return { added: [], removed: [], skipped: true };
  }

  const enabled = resolveEnabledModules(repoRoot);
  const closedPrefixes = tryReadClosedPrefixes(repoRoot);
  const enabledUiPackages = new Set(
    enabled
      .filter((mod) => mod.hasUi)
      .filter(
        (mod) =>
          moduleTier(path.relative(repoRoot, mod.dir), closedPrefixes) !== "pro"
      )
      .map((mod) => mod.packageName)
  );
  const allModulePackages = listModulePackageNames(repoRoot);

  const parsed = readJson(uiPackageJsonPath);
  const dependencies =
    parsed.dependencies && typeof parsed.dependencies === "object"
      ? { ...parsed.dependencies }
      : {};

  const added = [];
  const removed = [];

  for (const packageName of enabledUiPackages) {
    if (!Object.hasOwn(dependencies, packageName)) {
      dependencies[packageName] = "workspace:*";
      added.push(packageName);
    }
  }

  for (const packageName of Object.keys(dependencies)) {
    if (
      packageName.startsWith(MODULE_DEP_PREFIX) &&
      allModulePackages.has(packageName) &&
      !enabledUiPackages.has(packageName) &&
      !UI_SHELL_PINNED_MODULE_DEPS.includes(packageName)
    ) {
      delete dependencies[packageName];
      removed.push(packageName);
    }
  }

  const nextDependencies = Object.fromEntries(
    Object.entries(dependencies).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );

  // A correct sync removes a dependency when someone disables a module — one
  // or two at a time. A wholesale removal means the UI detection broke, not
  // that the product changed, and writing it out silently deletes most of a
  // committed manifest: the app then builds until the next install, and fails
  // with an unresolvable import after it. Refuse instead, and say what would
  // have gone.
  if (removed.length > BULK_REMOVAL_LIMIT) {
    throw new Error(
      [
        `sync-ui-module-deps: refusing to remove ${removed.length} module dependencies from apps/ui/package.json.`,
        "That many at once means UI detection failed, not that the product changed.",
        `Would have removed: ${removed.join(", ")}`,
        "Check moduleHasUi in scripts/lib/engenty-modules.mjs against the modules on disk.",
      ].join("\n")
    );
  }

  const changed =
    added.length > 0 ||
    removed.length > 0 ||
    JSON.stringify(parsed.dependencies ?? {}) !==
      JSON.stringify(nextDependencies);

  if (changed && removed.length > 0) {
    console.log(
      `sync-ui-module-deps: removing ${removed.join(", ")} from apps/ui/package.json`
    );
  }

  if (changed) {
    fs.writeFileSync(
      uiPackageJsonPath,
      `${JSON.stringify({ ...parsed, dependencies: nextDependencies }, null, 2)}\n`,
      "utf-8"
    );
  }

  return { added, removed, skipped: false, changed };
}

function main() {
  const result = syncUiModuleDependencies();
  if (result.skipped) {
    console.log("sync-ui-module-deps: skipped (apps/ui/package.json missing)");
    return;
  }
  const parts = [];
  if (result.added.length > 0) {
    parts.push(`added ${result.added.join(", ")}`);
  }
  if (result.removed.length > 0) {
    parts.push(`removed ${result.removed.join(", ")}`);
  }
  if (parts.length === 0) {
    console.log("sync-ui-module-deps: apps/ui module deps already in sync");
    return;
  }
  console.log(`sync-ui-module-deps: ${parts.join("; ")}`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
