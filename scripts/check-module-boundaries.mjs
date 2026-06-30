#!/usr/bin/env node
/**
 * Guardrail: a module must never be a dependency of the core shell.
 *
 * Modules (`modules/*`) may depend on shared packages and on each other, but the
 * reverse is forbidden: no app (`apps/*`) and no shared package (`packages/*`)
 * may list an `@engenty/<module>` package in any dependency field.
 *
 * Modules are wired into the UI through the generated plugin catalog, whose
 * imports resolve to module source via vite aliases (see apps/ui/vite.config.ts).
 * That sanctioned path never appears in a package.json, so it is unaffected by
 * this check — the check only catches hard workspace `dependencies` edges.
 *
 * Run via `pnpm boundaries:check`. Also asserted by a vitest guardrail so it runs
 * with `pnpm test`. Exits non-zero (and prints the offending edges) on violation.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveRepoRoot } from "./lib/engenty-modules.mjs";

const MODULE_DIR = "modules";
const CONSUMER_DIRS = ["apps", "packages"];
const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/**
 * Legacy allowlist: consumer dir (workspace-relative) -> module packages it may
 * still import as a hard workspace dep. `@engenty/engenty-copilot` is a temporary
 * shell import in apps/ui and apps/ai until it is fully plugin-only. Shrink this
 * list as legacy deps are removed; never add a new module here — wire it through
 * the plugin catalog instead.
 */
const LEGACY_DEP_ALLOWLIST = {
  "apps/ui": ["@engenty/engenty-copilot"],
  "apps/ai": ["@engenty/engenty-copilot"],
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function listDirs(absDir) {
  if (!fs.existsSync(absDir)) {
    return [];
  }
  return fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);
}

/** Package names declared under modules/*. */
function collectModulePackageNames(repoRoot) {
  const names = new Set();
  const modulesAbs = path.join(repoRoot, MODULE_DIR);
  for (const name of listDirs(modulesAbs)) {
    const pkgPath = path.join(modulesAbs, name, "package.json");
    if (!fs.existsSync(pkgPath)) {
      continue;
    }
    const pkg = readJson(pkgPath);
    if (typeof pkg.name === "string" && pkg.name.startsWith("@engenty/")) {
      names.add(pkg.name);
    }
  }
  return names;
}

/**
 * Returns an array of violations: { consumer, field, dependency }.
 * @param {string} [repoRoot]
 */
export function findModuleBoundaryViolations(repoRoot = resolveRepoRoot()) {
  const moduleNames = collectModulePackageNames(repoRoot);
  const violations = [];

  for (const consumerDir of CONSUMER_DIRS) {
    const consumerAbs = path.join(repoRoot, consumerDir);
    for (const name of listDirs(consumerAbs)) {
      const rel = `${consumerDir}/${name}`;
      const pkgPath = path.join(consumerAbs, name, "package.json");
      if (!fs.existsSync(pkgPath)) {
        continue;
      }
      const pkg = readJson(pkgPath);
      const allowed = new Set(LEGACY_DEP_ALLOWLIST[rel] ?? []);

      for (const field of DEP_FIELDS) {
        const deps = pkg[field];
        if (!deps || typeof deps !== "object") {
          continue;
        }
        for (const dependency of Object.keys(deps)) {
          if (moduleNames.has(dependency) && !allowed.has(dependency)) {
            violations.push({ consumer: rel, field, dependency });
          }
        }
      }
    }
  }

  return violations;
}

function main() {
  const violations = findModuleBoundaryViolations();
  if (violations.length === 0) {
    console.log(
      "check-module-boundaries: ok — no module is a dependency of an app or package"
    );
    return;
  }

  console.error(
    "check-module-boundaries: a module must NOT be a dependency of the core shell.\n"
  );
  for (const { consumer, field, dependency } of violations) {
    console.error(`  ✗ ${consumer} (${field}) depends on module ${dependency}`);
  }
  console.error(
    "\nModules are wired in through the generated plugin catalog (resolved to source\n" +
      "via apps/ui/vite.config.ts aliases), not via package.json dependencies. Remove\n" +
      "the dependency above, or — only for a sanctioned legacy shell import — add it to\n" +
      "LEGACY_DEP_ALLOWLIST in scripts/check-module-boundaries.mjs."
  );
  process.exit(1);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
