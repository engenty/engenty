#!/usr/bin/env node
/**
 * First-run / refresh local generated artifacts from what's installed on disk.
 *
 * 1. Materialize supabase/config.toml from config.toml.example (if missing, or with --refresh)
 * 2. supabase:sync — compose module API schemas, buckets, aggregate migrations
 * 3. sync UI module deps from engenty.plugins
 * 4. generate:plugins — UI catalog + Tailwind sources from declared modules/packages
 *
 * Generated outputs are gitignored; run `pnpm engenty setup` after clone and when the module set changes.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

function materializeSupabaseConfig(root, refresh) {
  const examplePath = path.join(root, "supabase", "config.toml.example");
  const configPath = path.join(root, "supabase", "config.toml");
  if (!fs.existsSync(examplePath)) {
    throw new Error(
      `Missing ${examplePath}. The committed Supabase template must exist in the repo.`
    );
  }
  if (!refresh && fs.existsSync(configPath)) {
    return false;
  }
  fs.copyFileSync(examplePath, configPath);
  return true;
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.size > 1 || (args.size === 1 && !args.has("--refresh"))) {
    throw new Error("Usage: node scripts/setup.mjs [--refresh]");
  }

  const root = resolveRepoRoot();
  const refreshedConfig = materializeSupabaseConfig(
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
    refreshedConfig
      ? "materialized supabase/config.toml from config.toml.example"
      : "reused existing supabase/config.toml",
    uiSync.changed
      ? "synced apps/ui module deps from engenty.plugins"
      : "apps/ui module deps in sync",
    "ran supabase:sync",
    "generated UI plugin artifacts",
  ];
  console.log(`setup: ${parts.join("; ")}.`);
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error && error.message ? error.message : String(error)
  );
  process.exitCode = 1;
}
