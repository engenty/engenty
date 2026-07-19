#!/usr/bin/env node
/**
 * Test-wiring guard for the per-package `turbo run test` pipeline.
 *
 * `turbo run test` only runs packages that declare a `test` script, and a bare
 * `vitest run` in a package WITHOUT its own vitest.config.ts resolves the
 * repo-root config and silently collects the ENTIRE workspace suite. Both
 * failure modes are invisible in CI output, so this script fails CI when:
 *
 *   1. a workspace package contains test files but has no `test` script
 *      (its tests would never run), or
 *   2. a package's `test` script invokes vitest without `--config`, `--root`,
 *      or `-r` while the package has no local vitest.config.ts
 *      (it would re-run the whole workspace inside one package's task).
 *
 * Scoping convention for packages without a local config:
 *   "test": "vitest run --root <rel-path-to-repo-root> <pkg-path-from-root>/"
 * The trailing slash matters: vitest CLI filters are substring matches, so
 * `modules/team` would also collect `modules/team-chat` tests.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const workspaceGlobs = [
  "apps/*",
  "modules/*",
  "modules/*/providers/*",
  "packages/*",
];

function globDirs(pattern) {
  const parts = pattern.split("/");
  let dirs = [repoRoot];
  for (const part of parts) {
    const next = [];
    for (const dir of dirs) {
      if (part === "*") {
        if (!fs.existsSync(dir)) {
          continue;
        }
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name !== "node_modules") {
            next.push(path.join(dir, entry.name));
          }
        }
      } else {
        next.push(path.join(dir, part));
      }
    }
    dirs = next;
  }
  return dirs.filter((d) => fs.existsSync(path.join(d, "package.json")));
}

function hasTestFiles(pkgDir) {
  // git ls-files respects .gitignore (dist, node_modules, generated output).
  const out = execSync(
    "git ls-files --cached --others --exclude-standard -- '*.test.ts' '*.test.tsx'",
    { cwd: pkgDir, encoding: "utf8" }
  ).trim();
  if (!out) {
    return false;
  }
  // Exclude files that belong to a NESTED workspace package (e.g. a module's
  // providers/*) — those are checked as their own package.
  return out.split("\n").some((file) => {
    let dir = path.dirname(path.join(pkgDir, file));
    while (dir !== pkgDir) {
      if (fs.existsSync(path.join(dir, "package.json"))) {
        return false;
      }
      dir = path.dirname(dir);
    }
    return !(file.includes("/dist/") || file.endsWith(".e2e.test.ts"));
  });
}

const problems = [];
for (const pkgDir of workspaceGlobs.flatMap(globDirs)) {
  const rel = path.relative(repoRoot, pkgDir);
  const pkg = JSON.parse(
    fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")
  );
  const testScript = pkg.scripts?.test;
  const hasLocalConfig =
    fs.existsSync(path.join(pkgDir, "vitest.config.ts")) ||
    fs.existsSync(path.join(pkgDir, "vitest.config.mts"));

  if (!testScript) {
    if (hasTestFiles(pkgDir)) {
      problems.push(
        `${rel}: contains *.test.ts(x) files but no "test" script — ` +
          `'turbo run test' will silently skip them. Add:\n` +
          `    "test": "vitest run --root <rel-to-repo-root> ${rel}/"`
      );
    }
    continue;
  }

  const scoped =
    testScript.includes("--config") ||
    testScript.includes("--root") ||
    /(^|\s)-r\s/.test(testScript);
  if (testScript.includes("vitest") && !scoped && !hasLocalConfig) {
    problems.push(
      `${rel}: "test" script runs vitest without --config/--root and the package ` +
        "has no local vitest.config.ts — this resolves the repo-root config and " +
        "collects the WHOLE workspace suite. Scope it:\n" +
        `    "test": "vitest run --root <rel-to-repo-root> ${rel}/"`
    );
  }
}

if (problems.length > 0) {
  console.error("Test wiring problems found:\n");
  for (const p of problems) {
    console.error(`- ${p}\n`);
  }
  process.exit(1);
}
console.log(
  "check-test-wiring: OK — every package with tests is wired and scoped."
);
