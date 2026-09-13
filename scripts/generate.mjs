#!/usr/bin/env node
/**
 * Regenerate the local derived artifacts from what's installed on disk.
 *
 * 1. Materialize supabase/config.toml from config.toml.example (if missing, or with --refresh)
 * 2. supabase:sync — compose module API schemas, buckets, aggregate migrations
 * 3. sync UI module deps from engenty.plugins
 * 4. generate:plugins — UI catalog + Tailwind sources from declared modules/packages
 *
 * Generated outputs are gitignored; `pnpm engenty setup` runs this on the first
 * run, `pnpm engenty generate` any time the module set changes.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { materializeSupabaseConfig } from "./lib/supabase-local-stack.mjs";
import { syncUiModuleDependencies } from "./lib/sync-ui-module-deps.mjs";

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

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.size > 1 || (args.size === 1 && !args.has("--refresh"))) {
    throw new Error("Usage: node scripts/generate.mjs [--refresh]");
  }

  const root = resolveRepoRoot();
  const materializedProjectId = materializeSupabaseConfig(
    root,
    args.has("--refresh")
  );

  execFileSync(process.execPath, [path.join(SCRIPT_DIR, "supabase-sync.mjs")], {
    cwd: root,
    stdio: "inherit",
  });

  const uiSync = syncUiModuleDependencies(root);
  if (uiSync.changed) {
    execFileSync("pnpm", ["install"], { cwd: root, stdio: "inherit" });
  }

  execFileSync("pnpm", ["--filter", "@engenty/ui", "generate:plugins"], {
    cwd: root,
    stdio: "inherit",
  });

  const parts = [
    materializedProjectId
      ? `materialized supabase/config.toml from config.toml.example (project_id "${materializedProjectId}")`
      : "reused existing supabase/config.toml",
    uiSync.changed
      ? "synced apps/ui module deps from engenty.plugins"
      : "apps/ui module deps in sync",
    "ran supabase:sync",
    "generated UI plugin artifacts",
  ];
  console.log(`generate: ${parts.join("; ")}.`);
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error && error.message ? error.message : String(error)
  );
  process.exitCode = 1;
}
