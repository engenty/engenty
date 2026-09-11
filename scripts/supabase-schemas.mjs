#!/usr/bin/env node
/**
 * Print the PostgREST schemas this checkout's enabled modules need exposed.
 *
 * Read from the committed migration sources, so it answers correctly on a bare
 * `git clone` — before `pnpm install`, before a database exists, and without
 * the gitignored supabase/config.toml. `engenty db sync` writes the same list
 * into config.toml for local development; the deploy wizard and DEPLOY.md use
 * this one for the hosted database, which has no config.toml at all.
 *
 *   node scripts/supabase-schemas.mjs            # comma-separated, paste-ready
 *   node scripts/supabase-schemas.mjs --json     # JSON array
 *   node scripts/supabase-schemas.mjs --lines    # one per line
 */
import {
  resolveMigrationOwners,
  resolveRepoRoot,
} from "./lib/migration-owners.mjs";
import { composeApiSchemasFromOwners } from "./supabase-sync-lib.mjs";

const root = resolveRepoRoot();
const schemas = composeApiSchemasFromOwners(resolveMigrationOwners(root));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(schemas));
} else if (process.argv.includes("--lines")) {
  console.log(schemas.join("\n"));
} else {
  console.log(schemas.join(", "));
}
