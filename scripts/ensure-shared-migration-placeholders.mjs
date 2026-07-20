#!/usr/bin/env node
/**
 * Shared local Supabase is used by every engenty worktree. Another checkout may
 * have applied migrations this tree does not own (closed modules, feature
 * branches). `supabase migration up` then fails with:
 *   Remote migration versions not found in local migrations directory.
 *
 * After aggregate, write no-op placeholder files for remote-only versions so
 * the CLI history check passes. Already-applied versions are never re-run.
 *
 * Usage: node scripts/ensure-shared-migration-placeholders.mjs
 * Exit 0 even when the DB is unreachable (migrate will surface its own error).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const PLACEHOLDER_SUFFIX = "_shared_stack_placeholder.sql";
const VERSION_RE = /^(\d{14})/;
const DB_URL =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith(".sql"));
}

/** @returns {Map<string, string[]>} version -> basenames */
function localVersions() {
  /** @type {Map<string, string[]>} */
  const byVersion = new Map();
  for (const entry of listMigrationFiles()) {
    const match = VERSION_RE.exec(entry);
    if (!match) {
      continue;
    }
    const list = byVersion.get(match[1]) ?? [];
    list.push(entry);
    byVersion.set(match[1], list);
  }
  return byVersion;
}

function remoteVersions() {
  try {
    const out = execFileSync(
      "psql",
      [
        DB_URL,
        "-v",
        "ON_ERROR_STOP=1",
        "-tAc",
        "select version from supabase_migrations.schema_migrations order by version",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\d{14}$/.test(line));
  } catch {
    // Fall back to docker exec when host psql is missing / can't reach 54322.
    try {
      const out = execFileSync(
        "docker",
        [
          "exec",
          "supabase_db_engenty-local",
          "psql",
          "-U",
          "postgres",
          "-tAc",
          "select version from supabase_migrations.schema_migrations order by version",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
      );
      return out
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d{14}$/.test(line));
    } catch {
      return null;
    }
  }
}

function placeholderBody(version) {
  return [
    `-- shared-stack placeholder for version ${version}`,
    "-- Applied on the shared local Supabase by another worktree / plugin set.",
    "-- This file exists only so `supabase migration up` accepts the history.",
    "-- It is never executed when the version is already recorded as applied.",
    "select 1;",
    "",
  ].join("\n");
}

function main() {
  const remote = remoteVersions();
  if (remote === null) {
    console.log(
      "ensure-shared-migration-placeholders: skipped (local DB not reachable)."
    );
    return;
  }

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }

  const local = localVersions();
  let written = 0;
  let removed = 0;

  // Drop placeholders when a real migration for the same version exists.
  for (const [version, names] of local) {
    const placeholders = names.filter((n) => n.endsWith(PLACEHOLDER_SUFFIX));
    const reals = names.filter((n) => !n.endsWith(PLACEHOLDER_SUFFIX));
    if (reals.length === 0) {
      continue;
    }
    for (const basename of placeholders) {
      fs.unlinkSync(path.join(MIGRATIONS_DIR, basename));
      removed += 1;
    }
    local.set(version, reals);
  }

  for (const version of remote) {
    if (local.has(version)) {
      continue;
    }
    const basename = `${version}${PLACEHOLDER_SUFFIX}`;
    const outPath = path.join(MIGRATIONS_DIR, basename);
    fs.writeFileSync(outPath, placeholderBody(version), "utf8");
    local.set(version, [basename]);
    written += 1;
  }

  if (written > 0 || removed > 0) {
    const parts = [];
    if (written > 0) {
      parts.push(
        `wrote ${written} placeholder(s) for other-worktree migrations`
      );
    }
    if (removed > 0) {
      parts.push(`removed ${removed} stale placeholder(s)`);
    }
    console.log(`ensure-shared-migration-placeholders: ${parts.join(", ")}`);
  }
}

main();
