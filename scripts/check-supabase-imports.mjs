#!/usr/bin/env node
/**
 * Guardrail: detect runtime @supabase/supabase-js imports outside approved
 * adapter locations (see AGENTS.md "Backend adapters").
 * Run: pnpm check:supabase-imports
 *
 * Rules:
 * - Type-only imports (`import type { SupabaseClient } ...`) are allowed
 *   everywhere — passing the client handle through wiring is not coupling.
 * - Runtime imports (createClient etc.) must live in adapter locations:
 *   DAL/infra directories, auth stores/adapters, or ops scripts/tests.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd());

// Approved locations for runtime imports (relative to repo root).
const ALLOWED_PATTERNS = [
  /^apps\/[^/]+\/src\/dal\//,
  /^apps\/[^/]+\/src\/infra\//,
  /^apps\/core\/src\/identity\//,
  /^apps\/core\/src\/storage\//,
  /^apps\/core\/src\/security\/audit-supabase/,
  /^apps\/core\/src\/security\/auth-stores\//,
  /^modules\/[^/]+\/src\/dal\//,
  /^packages\/[^/]+\/src\/dal\//,
  /^packages\/[^/]+\/scripts\//, // ops/backfill scripts need a real client
  /^packages\/auth-ui\//, // the Supabase auth adapter package
  // Tests may construct real clients against local supabase.
  /\.test\.tsx?$/,
  /(^|\/)__tests__\//,
];

// Pre-existing inline createClient calls in API routes. Do not add to this
// list — new routes must go through the infra/DAL adapters instead.
const LEGACY_EXCEPTIONS = new Set([
  "apps/core/src/api/routes/auth/dev-login-routes.ts",
  "apps/core/src/api/routes/file-storage-routes.ts",
  "apps/core/src/api/routes/queue-routes.ts",
]);

function isAllowed(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  return (
    LEGACY_EXCEPTIONS.has(normalized) ||
    ALLOWED_PATTERNS.some((re) => re.test(normalized))
  );
}

function findTsFiles(dir, base = dir, acc = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = relative(base, full);
    if (e.isDirectory()) {
      if (
        e.name === "node_modules" ||
        e.name === "dist" ||
        e.name === ".git" ||
        e.name === "coverage"
      ) {
        continue;
      }
      findTsFiles(full, base, acc);
    } else if (
      (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) &&
      !e.name.endsWith(".d.ts")
    ) {
      acc.push({ full, rel });
    }
  }
  return acc;
}

function hasRuntimeSupabaseImport(content) {
  const statements =
    content.match(
      /(?:import|export)\s[^;]*?from\s*["']@supabase\/supabase-js["']/g
    ) ?? [];
  if (statements.some((s) => !/^(?:import|export)\s+type\b/.test(s))) {
    return true;
  }
  return /require\s*\(\s*["']@supabase\/supabase-js["']\s*\)/.test(content);
}

function main() {
  const workspaces = ["apps", "packages", "modules"];
  const violations = [];

  for (const w of workspaces) {
    const workspaceDir = join(ROOT, w);
    try {
      const dirs = readdirSync(workspaceDir, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) {
          continue;
        }
        const pkgDir = join(workspaceDir, d.name);
        const files = findTsFiles(pkgDir, ROOT);
        for (const { full, rel } of files) {
          const content = readFileSync(full, "utf-8");
          if (hasRuntimeSupabaseImport(content) && !isAllowed(rel)) {
            violations.push(rel);
          }
        }
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      "check-supabase-imports: runtime @supabase/supabase-js imports found outside approved adapter locations:\n"
    );
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    console.error(
      "\nSee AGENTS.md 'Backend adapters' and scripts/check-supabase-imports.mjs allowlist."
    );
    process.exit(1);
  }

  console.log("check-supabase-imports: OK (no violations)");
}

main();
