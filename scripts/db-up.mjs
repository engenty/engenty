#!/usr/bin/env node
/**
 * Start the local Supabase stack LEAN by default.
 *
 * A local Supabase is twelve containers, and three of them exist only so the
 * Studio UI has something to show. Measured on an idle stack (2026-08-10, 10-core
 * Mac): Supabase Studio + the Kong requests it makes ≈ 137% CPU, and the log
 * pipeline (Vector tails EVERY container's logs through the Docker API →
 * Logflare ingests them → both write to Postgres) ≈ 85%. The database itself was
 * 15-24%. With two or three worktree stacks up, that saturates the machine and
 * the failure looks like an application bug: GoTrue stops answering in time and
 * the app reports "Unauthorized" for what is really an unreachable auth server.
 *
 * So both are opt-in:
 *
 *   pnpm db:up                  # 9 containers — no Studio, no log pipeline
 *   pnpm db:up --studio         # + Supabase Studio
 *   pnpm db:up --logs           # + analytics (Logflare) and vector
 *   pnpm db:up --studio --logs  # what `supabase start` did before
 *
 * The flags are not passed to the CLI — `supabase start` has no such switches.
 * They patch the `enabled` line under `[studio]` / `[analytics]` in the local
 * (gitignored) `supabase/config.toml`, which is what the CLI reads. The patch is
 * written every run, so the flags you pass are exactly what you get rather than
 * whatever the last run left behind.
 *
 * Vector has no flag of its own: the CLI only starts it to feed analytics, so
 * `--logs` covers both. Verified by container count — a stack with analytics off
 * has no vector container.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSupabaseCliBin } from "./lib/supabase-cli.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(ROOT, "supabase", "config.toml");

const USAGE = `Usage: pnpm db:up [--studio] [--logs]

  --studio   also start Supabase Studio (the DB browser UI)
  --logs     also start the Logflare/Vector log pipeline (Studio's Logs tab)

Both are off by default because they cost more CPU than the database.
Already running? Stop it first: pnpm supabase:stop`;

/**
 * Set `enabled` on a top-level TOML section, in place.
 *
 * Deliberately line-based rather than a TOML round-trip: `config.toml` carries
 * the upstream comments plus engenty's managed blocks (`>>> engenty:…`), and
 * re-serialising it would quietly reformat both.
 */
export function setSectionEnabled(toml, section, enabled) {
  const lines = toml.split("\n");
  let inSection = false;
  let changed = false;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inSection = trimmed === `[${section}]`;
      continue;
    }
    if (inSection && /^enabled\s*=/.test(trimmed)) {
      lines[index] = `enabled = ${enabled}`;
      changed = true;
      inSection = false;
    }
  }
  if (!changed) {
    throw new Error(`no [${section}] enabled key in supabase/config.toml`);
  }
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  let withStudio = false;
  let withLogs = false;
  for (const arg of args) {
    if (arg === "--studio") {
      withStudio = true;
    } else if (arg === "--logs") {
      withLogs = true;
    } else if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${USAGE}\n`);
      return;
    } else {
      process.stderr.write(`Unknown option: ${arg}\n\n${USAGE}\n`);
      process.exit(1);
    }
  }

  if (!existsSync(CONFIG_PATH)) {
    process.stderr.write(
      "supabase/config.toml not found — run `pnpm setup` first.\n"
    );
    process.exit(1);
  }

  let toml = readFileSync(CONFIG_PATH, "utf-8");
  toml = setSectionEnabled(toml, "studio", withStudio);
  toml = setSectionEnabled(toml, "analytics", withLogs);
  writeFileSync(CONFIG_PATH, toml);

  const extras = [
    withStudio ? "studio" : null,
    withLogs ? "logs" : null,
  ].filter(Boolean);
  process.stdout.write(
    `supabase start — lean${extras.length ? ` + ${extras.join(" + ")}` : ""}\n`
  );

  const result = spawnSync(resolveSupabaseCliBin(ROOT), ["start"], {
    cwd: ROOT,
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
