#!/usr/bin/env node
/**
 * Placeholders for held-back migrations a database already applied.
 *
 * The aggregate step leaves out the migrations of modules below
 * ENGENTY_MODULE_STAGE (a `dev` module on a `beta` install), so a fresh
 * database never gets their tables. A database that applied them before
 * (production ran banking and inbox while they were in every install) still
 * lists those versions, and `supabase db push` refuses a history with versions
 * it has no file for. This writes a no-op file for exactly those versions: held
 * back (listed in supabase/held-migrations.json) AND already applied. Any
 * other unknown version still stops the push, as it should.
 *
 * Usage (from the directory holding supabase/):
 *   node held-migration-placeholders.mjs --db-url <postgres url>
 *   node held-migration-placeholders.mjs --linked
 *
 * Self-contained on purpose: the migrate image copies this one file.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SUPABASE_DIR = path.resolve("supabase");
const MIGRATIONS_DIR = path.join(SUPABASE_DIR, "migrations");
const HELD_FILE = path.join(SUPABASE_DIR, "held-migrations.json");

function readHeldVersions() {
  if (!fs.existsSync(HELD_FILE)) {
    return new Set();
  }
  const parsed = JSON.parse(fs.readFileSync(HELD_FILE, "utf8"));
  return new Set(Array.isArray(parsed.versions) ? parsed.versions : []);
}

/** Versions the database has applied that no local file carries. */
function remoteOnlyVersions(target) {
  const out = execFileSync(
    "supabase",
    ["migration", "list", ...target, "--output-format", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  );
  const { migrations = [] } = JSON.parse(out);
  return migrations
    .filter((entry) => entry.remote && !entry.local)
    .map((entry) => entry.remote);
}

function main() {
  const args = process.argv.slice(2);
  const dbUrlIndex = args.indexOf("--db-url");
  let target;
  if (dbUrlIndex !== -1 && args[dbUrlIndex + 1]) {
    target = ["--db-url", args[dbUrlIndex + 1]];
  } else if (args.includes("--linked")) {
    target = ["--linked"];
  } else {
    throw new Error("Pass --db-url <postgres url> or --linked.");
  }

  const held = readHeldVersions();
  if (held.size === 0) {
    return;
  }
  const versions = remoteOnlyVersions(target).filter((version) =>
    held.has(version)
  );
  for (const version of versions) {
    fs.writeFileSync(
      path.join(MIGRATIONS_DIR, `${version}_held_placeholder.sql`),
      [
        `-- held-back migration ${version}: its module is below this install's`,
        "-- ENGENTY_MODULE_STAGE. The database applied it earlier; this file only",
        "-- lets `supabase db push` accept that history. It never runs.",
        "select 1;",
        "",
      ].join("\n")
    );
  }
  if (versions.length > 0) {
    console.log(
      `held-migration-placeholders: ${versions.length} applied, held-back migration(s) kept in the history.`
    );
  }
}

main();
