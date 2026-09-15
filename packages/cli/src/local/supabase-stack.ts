import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { engentyHome, ensureEngentyHome } from "../home.js";
import { requireReleaseManifest } from "../release-manifest.js";
import { cliPackageRoot } from "../workspace.js";
import { requireTemplate } from "./package-templates.js";
import { findFreePortBand, isPortFree } from "./port-band.js";

/** Distinct from a checkout's `engenty-local`: this stack belongs to the CLI. */
export const MANAGED_PROJECT_ID = "engenty";

interface LocalStackLib {
  applyLocalStackIdentity: (
    content: string,
    params: { portOffset?: number; projectId: string }
  ) => string;
  configuredPorts: (content: string) => number[];
}

/**
 * The port/project rules live in one `.mjs` next to the migrations so the
 * checkout's `scripts/setup.mjs` and this command cannot disagree about which
 * band a stack owns.
 */
async function localStackLib(): Promise<LocalStackLib> {
  const href = pathToFileURL(
    path.join(cliPackageRoot(), "lib", "supabase-local-stack.mjs")
  ).href;
  return (await import(href)) as LocalStackLib;
}

/** Replace the managed `schemas = [...]` line with what this release exposes. */
export function applyApiSchemas(
  content: string,
  schemas: readonly string[]
): string {
  const rendered = JSON.stringify(schemas);
  const managed =
    /(# >>> engenty:api-schemas[^\n]*\nschemas\s*=\s*)\[[^\]]*\]/m;
  if (managed.test(content)) {
    return content.replace(managed, `$1${rendered}`);
  }
  return content.replace(/^schemas\s*=\s*\[[^\]]*\]/m, `schemas = ${rendered}`);
}

/**
 * Flip a section's `enabled` line. `supabase start` has no switches for this —
 * the CLI reads config.toml, which is also why `scripts/db-up.mjs` patches the
 * same lines rather than passing flags.
 */
export function setSectionEnabled(
  content: string,
  section: string,
  enabled: boolean
): string {
  const lines = content.split("\n");
  let inSection = false;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inSection = trimmed === `[${section}]`;
      continue;
    }
    if (inSection && /^enabled\s*=/.test(trimmed)) {
      lines[index] = `enabled = ${enabled}`;
      inSection = false;
    }
  }
  return lines.join("\n");
}

/**
 * Studio and the Logflare/Vector pipeline idle at 190–275 % CPU between them,
 * which is most of what a laptop notices about running this. Vector has no
 * section of its own: the CLI starts it only to feed analytics.
 *
 * Edge Runtime goes too. A release ships no `supabase/functions`, so the
 * container runs for nothing — and it is the one Supabase service the CLI
 * starts without a restart policy, so leaving it on would also be the only
 * reason a managed install came back incomplete after a reboot.
 */
export function applyLeanServices(content: string): string {
  let next = content;
  for (const section of ["studio", "analytics", "edge_runtime"]) {
    next = setSectionEnabled(next, section, false);
  }
  return next;
}

export interface StackIdentity {
  apiPort: number;
  dbPort: number;
  ports: number[];
  projectId: string;
}

function firstPort(content: string): number {
  const match = content.match(/^\s*port\s*=\s*(\d+)\s*$/m);
  return match ? Number(match[1]) : 54_321;
}

function dbPortOf(content: string): number {
  const section = content
    .split(/^\[/m)
    .find((block) => block.startsWith("db]"));
  const match = section?.match(/^port\s*=\s*(\d+)/m);
  return match ? Number(match[1]) : firstPort(content) + 1;
}

export function readStackIdentity(home = engentyHome()): StackIdentity | null {
  const configPath = path.join(home, "supabase", "config.toml");
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const content = fs.readFileSync(configPath, "utf8");
  return {
    apiPort: firstPort(content),
    dbPort: dbPortOf(content),
    ports: [],
    projectId: MANAGED_PROJECT_ID,
  };
}

/**
 * Write `<home>/supabase/config.toml` once. Keeps an existing file — its ports
 * are the ones the running containers bound, and rewriting them would strand
 * the stack.
 */
/** Pure: the config.toml a managed install runs, given the shipped template. */
export async function buildStackConfig(
  template: string,
  params: { portOffset: number; schemas: readonly string[] }
): Promise<string> {
  const lib = await localStackLib();
  return applyLeanServices(
    applyApiSchemas(
      lib.applyLocalStackIdentity(template, {
        portOffset: params.portOffset,
        projectId: MANAGED_PROJECT_ID,
      }),
      params.schemas
    )
  );
}

/**
 * Write `<home>/supabase/config.toml` once. Keeps an existing file — its ports
 * are the ones the running containers bound, and rewriting them would strand
 * the stack.
 */
export async function ensureStackConfig(
  home = engentyHome()
): Promise<StackIdentity> {
  const existing = readStackIdentity(home);
  if (existing) {
    return existing;
  }
  const manifest = requireReleaseManifest("start");
  const template = fs.readFileSync(
    requireTemplate("config.toml.example"),
    "utf8"
  );
  const lib = await localStackLib();
  const content = await buildStackConfig(template, {
    portOffset: await findFreePortBand(lib.configuredPorts(template)),
    schemas: manifest.schemas,
  });
  ensureEngentyHome(home);
  fs.writeFileSync(path.join(home, "supabase", "config.toml"), content, "utf8");
  const identity = readStackIdentity(home);
  if (!identity) {
    throw new Error(`Failed to write ${home}/supabase/config.toml.`);
  }
  return identity;
}

function supabaseArgs(rest: readonly string[]): string[] {
  const manifest = requireReleaseManifest("start");
  return ["--yes", `supabase@${manifest.supabaseCliVersion}`, ...rest];
}

export function runManagedSupabase(
  rest: readonly string[],
  params: { capture?: boolean; home?: string } = {}
): { ok: boolean; output: string } {
  const home = params.home ?? engentyHome();
  const result = spawnSync("npx", supabaseArgs(rest), {
    cwd: home,
    encoding: "utf8",
    stdio: params.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

export interface StackCredentials {
  SUPABASE_ANON_KEY: string;
  SUPABASE_DB_URL: string;
  /**
   * The symmetric secret the local stack verifies HS256 with. The server lane
   * signs its engenty_server tokens with it; without it the lane falls back to
   * ENGENTY_SECURITY_JWT_SECRET, which the stack does not know, and core
   * refuses to start ("No suitable key or wrong key type").
   */
  SUPABASE_JWT_SECRET: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_URL: string;
}

/** `supabase status -o env` prints `KEY="value"` lines. */
export function parseStatusEnv(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (match) {
      values[match[1]] = match[2];
    }
  }
  return values;
}

const STATUS_KEYS = {
  SUPABASE_ANON_KEY: ["ANON_KEY"],
  SUPABASE_DB_URL: ["DB_URL"],
  SUPABASE_JWT_SECRET: ["JWT_SECRET"],
  SUPABASE_SERVICE_ROLE_KEY: ["SERVICE_ROLE_KEY"],
  SUPABASE_URL: ["API_URL"],
} as const;

export function credentialsFromStatus(output: string): StackCredentials | null {
  const values = parseStatusEnv(output);
  const picked: Record<string, string> = {};
  for (const [key, candidates] of Object.entries(STATUS_KEYS)) {
    const hit = candidates.map((name) => values[name]).find(Boolean);
    if (!hit) {
      return null;
    }
    picked[key] = hit;
  }
  return picked as unknown as StackCredentials;
}

export function readStackCredentials(
  home = engentyHome()
): StackCredentials | null {
  const result = runManagedSupabase(["status", "-o", "env"], {
    capture: true,
    home,
  });
  return result.ok ? credentialsFromStatus(result.output) : null;
}

export async function isStackRunning(home = engentyHome()): Promise<boolean> {
  const identity = readStackIdentity(home);
  if (!identity) {
    return false;
  }
  return !(await isPortFree(identity.apiPort));
}

/**
 * Put the release's migrations where the Supabase CLI looks for them.
 *
 * `supabase start` applies `supabase/migrations` itself when it creates the
 * database, and PostgREST reads `db-schemas` at boot — so without this the
 * first start brings up an empty database and the API dies on
 * `schema "module_…" does not exist`, taking `supabase start` down with it.
 * A later release's migrations still arrive through `db push`, since the CLI
 * only seeds a database it just created.
 */
export function writeStackMigrations(home = engentyHome()): number {
  const manifest = requireReleaseManifest("start");
  const source = path.join(cliPackageRoot(), manifest.migrationsDir);
  const target = path.join(home, "supabase", "migrations");
  ensureEngentyHome(home);
  fs.rmSync(target, { force: true, recursive: true });
  fs.cpSync(source, target, { recursive: true });
  return fs.readdirSync(target).filter((name) => name.endsWith(".sql")).length;
}

export async function startStack(home = engentyHome()): Promise<void> {
  const identity = await ensureStackConfig(home);
  writeStackMigrations(home);
  if (await isStackRunning(home)) {
    console.log(`Supabase already up on port ${identity.apiPort}.`);
    return;
  }
  console.log(`Starting Supabase (project ${identity.projectId}) …`);
  const result = runManagedSupabase(["start"], { home });
  if (!result.ok) {
    throw new Error(
      `supabase start failed. Two common reasons: a cold run pulls several images and can time out with LegacyHealthCheckTimeoutError, in which case running \`engenty start\` again usually succeeds because the images are kept; or PostgREST refused a schema in ${home}/supabase/config.toml that the migrations did not create, which the log above names.`
    );
  }
}

export function stopStack(home = engentyHome()): void {
  runManagedSupabase(["stop"], { home });
}
