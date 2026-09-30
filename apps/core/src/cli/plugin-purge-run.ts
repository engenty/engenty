import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { confirm, isCancel } from "@clack/prompts";
import { isInteractiveTerminal, resolveSupabaseCliBin } from "@engenty/cli";
import {
  type PluginPurgePlan,
  planPluginPurge,
  purgeDependentsSql,
  purgeSql,
} from "./plugin-purge.js";

export interface PluginPurgeOptions {
  /** A remote database (`postgresql://…`); omitted means the local stack. */
  dbUrl?: string;
  /** Print what would go and the SQL, change nothing. */
  dryRun?: boolean;
  repoRoot: string;
  slug: string;
  /** Storage API base for a remote database (its SUPABASE_URL). */
  supabaseUrl?: string;
  /** Skip the confirmation. */
  yes?: boolean;
}

interface StorageTarget {
  key: string;
  url: string;
}

function supabaseTarget(options: PluginPurgeOptions): string[] {
  return options.dbUrl ? ["--db-url", options.dbUrl] : ["--local"];
}

function runSupabase(repoRoot: string, args: string[]): string {
  const result = spawnSync(resolveSupabaseCliBin(repoRoot), args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `supabase ${args[0]} ${args[1] ?? ""} failed:\n${result.stderr || result.stdout}`
    );
  }
  return result.stdout;
}

function queryRows(
  options: PluginPurgeOptions,
  sql: string
): Record<string, unknown>[] {
  const out = runSupabase(options.repoRoot, [
    "db",
    "query",
    ...supabaseTarget(options),
    "--output-format",
    "json",
    sql,
  ]);
  return (JSON.parse(out) as { rows?: Record<string, unknown>[] }).rows ?? [];
}

/**
 * The local stack serves the schemas listed in supabase/config.toml; dropping
 * one PostgREST still lists breaks its schema cache. A module this install
 * does not have is no longer listed after `pnpm engenty generate`.
 */
function assertNotExposedLocally(repoRoot: string, schemas: string[]): void {
  const configPath = path.join(repoRoot, "supabase", "config.toml");
  if (!fs.existsSync(configPath)) {
    return;
  }
  const listed = fs
    .readFileSync(configPath, "utf8")
    .match(/^schemas\s*=\s*\[([^\]]*)\]/m)?.[1];
  const exposed = schemas.filter((schema) => listed?.includes(`"${schema}"`));
  if (exposed.length > 0) {
    throw new Error(
      `The local API still serves ${exposed.join(", ")}. Run pnpm engenty generate, then pnpm engenty db restart, and purge again.`
    );
  }
}

function storageTarget(
  options: PluginPurgeOptions,
  plan: PluginPurgePlan
): StorageTarget | null {
  if (plan.buckets.length === 0) {
    return null;
  }
  // A remote database never takes the local SUPABASE_URL: that would empty
  // this machine's buckets and leave the remote files behind.
  const url = options.dbUrl ? options.supabaseUrl : process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!(url && key)) {
    throw new Error(
      options.dbUrl
        ? `"${plan.slug}" stores files (${plan.buckets.join(", ")}). Pass --supabase-url for that database and export its SUPABASE_SERVICE_ROLE_KEY.`
        : "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set (.env.local)."
    );
  }
  return { key, url: url.replace(/\/$/, "") };
}

async function storageRequest(
  target: StorageTarget,
  method: string,
  pathname: string
): Promise<Response> {
  return await fetch(`${target.url}/storage/v1/${pathname}`, {
    headers: { apikey: target.key, authorization: `Bearer ${target.key}` },
    method,
  });
}

/** Which of the buckets exist — and proof the key works, before anything is dropped. */
async function existingBuckets(
  target: StorageTarget,
  buckets: string[]
): Promise<string[]> {
  const found: string[] = [];
  for (const bucket of buckets) {
    const res = await storageRequest(target, "GET", `bucket/${bucket}`);
    if (res.ok) {
      found.push(bucket);
    } else if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Storage refused the service key (${res.status}) — is it the key for ${target.url}?`
      );
    }
  }
  return found;
}

async function removeBucket(
  target: StorageTarget,
  bucket: string
): Promise<void> {
  const emptied = await storageRequest(
    target,
    "POST",
    `bucket/${bucket}/empty`
  );
  if (!emptied.ok) {
    throw new Error(
      `Emptying bucket ${bucket} failed: ${await emptied.text()}`
    );
  }
  const removed = await storageRequest(target, "DELETE", `bucket/${bucket}`);
  if (!removed.ok) {
    throw new Error(
      `Deleting bucket ${bucket} failed: ${await removed.text()} — purge again to retry.`
    );
  }
}

async function confirmed(options: PluginPurgeOptions): Promise<boolean> {
  if (options.yes) {
    return true;
  }
  if (!isInteractiveTerminal()) {
    throw new Error(
      "Purge deletes data. Pass --yes to run it without a prompt."
    );
  }
  const answer = await confirm({
    message: `Delete all "${options.slug}" data${options.dbUrl ? " in the remote database" : ""}? This cannot be undone.`,
  });
  return !isCancel(answer) && answer === true;
}

/**
 * Purge a module's data: its tables, files, core rows and migration history.
 * The database part is one transaction and runs first; files follow, so a
 * failure leaves files, never rows pointing at deleted files. Every step is
 * safe to repeat, so a purge that stopped halfway is finished by running it
 * again.
 */
export async function runPluginPurge(
  options: PluginPurgeOptions
): Promise<void> {
  const plan = planPluginPurge(options.repoRoot, options.slug);
  if (!options.dbUrl) {
    assertNotExposedLocally(options.repoRoot, plan.schemas);
  }
  if (plan.schemas.length > 0) {
    const dependents = queryRows(options, purgeDependentsSql(plan.schemas));
    if (dependents.length > 0) {
      throw new Error(
        [
          `Other modules use "${options.slug}" tables; purge them first, or keep ${options.slug}:`,
          ...dependents.map((row) => `  - ${row.object} (${row.kind})`),
        ].join("\n")
      );
    }
  }
  const storage = storageTarget(options, plan);
  const buckets = storage ? await existingBuckets(storage, plan.buckets) : [];

  console.log(`Purge "${options.slug}":`);
  console.log(
    `  tables:   ${plan.purgeSql ? "the module's own purge SQL" : plan.schemas.join(", ") || "none"}`
  );
  console.log(`  files:    ${buckets.join(", ") || "none"}`);
  console.log(
    "  also:     its space mounts, tenant switches, instruction overrides, approval grants"
  );
  console.log(`  history:  ${plan.versions.length} migration version(s)`);
  const sql = purgeSql(plan);
  if (options.dryRun) {
    console.log(`\n${sql}`);
    return;
  }
  if (!(await confirmed(options))) {
    console.log("Nothing changed.");
    return;
  }

  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "engenty-purge-")),
    "purge.sql"
  );
  fs.writeFileSync(file, sql);
  try {
    runSupabase(options.repoRoot, [
      "db",
      "query",
      ...supabaseTarget(options),
      "--file",
      file,
    ]);
  } finally {
    fs.rmSync(path.dirname(file), { force: true, recursive: true });
  }
  for (const bucket of buckets) {
    if (storage) {
      await removeBucket(storage, bucket);
    }
  }
  console.log(
    `Purged "${options.slug}". Installing it again starts it empty: its migrations run from scratch.`
  );
}
