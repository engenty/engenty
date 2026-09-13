#!/usr/bin/env node
/**
 * CI guard: committed supabase/config.toml.example must stay module-agnostic.
 * Local supabase/config.toml is gitignored and composed by engenty generate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertCommittedSupabaseConfigIsModuleAgnostic } from "./supabase-sync-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  let dir = SCRIPT_DIR;
  for (let i = 0; i < 5; i++) {
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
    dir = path.dirname(dir);
  }
  return path.resolve(SCRIPT_DIR, "..");
}

function main() {
  const repoRoot = resolveRepoRoot();
  const examplePath = path.join(repoRoot, "supabase", "config.toml.example");
  if (!fs.existsSync(examplePath)) {
    throw new Error(`Missing ${examplePath}`);
  }
  const content = fs.readFileSync(examplePath, "utf8");
  assertCommittedSupabaseConfigIsModuleAgnostic(content);
  console.log(
    "check-committed-supabase-config: supabase/config.toml.example is module-agnostic."
  );
}

main();
