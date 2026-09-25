import type { Dirent } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import { createLogger } from "@engenty/telemetry";

import { getTenantDbFactoryFromEnv } from "../../infra/tenant-db.js";

import {
  resolveEngentyHostRoot,
  SANDBOX_CACHE_TOOLS,
} from "../workspace/local-workspace-paths.js";
import { resolveEngentyWorkspaceFsMode } from "../workspace/workspace-fs-mode.js";
import { destroyEngentySandboxById } from "./destroy-engenty-sandbox.js";
import {
  listEngentyDockerSandboxBinds,
  listEngentyDockerSandboxes,
} from "./engenty-sandbox-docker.js";
import { parseEngentySandboxId } from "./parse-engenty-sandbox-id.js";
import { reconcileSandboxSlots } from "./sandbox-admission.js";
import { sweepIdleUserBrowsers } from "./space-browser.js";
import { sweepIdleSpaceComputers } from "./space-computer.js";
import { type SpacesWithRow, sweepSpaceDrives } from "./space-drives.js";

const logger = createLogger({ name: "apps/ai/sandbox-staging-reaper" });

const DEFAULT_STAGING_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STAGING_MAX_BYTES = 10 * 1024 * 1024 * 1024;
// Caches earn their keep by being hit, so their TTL is measured in weeks, not
// hours — a space that runs a routine monthly should still find its wheels.
const DEFAULT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_MAX_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_SANDBOX_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const REAP_INTERVAL_MS = 60 * 60 * 1000;

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name]?.trim() ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveSandboxStagingTtlMs(): number {
  return readPositiveIntEnv(
    "ENGENTY_SANDBOX_STAGING_TTL_MS",
    DEFAULT_STAGING_TTL_MS
  );
}

export function resolveSandboxStagingMaxBytes(): number {
  return readPositiveIntEnv(
    "ENGENTY_SANDBOX_STAGING_MAX_BYTES",
    DEFAULT_STAGING_MAX_BYTES
  );
}

export function resolveSandboxCacheTtlMs(): number {
  return readPositiveIntEnv(
    "ENGENTY_SANDBOX_CACHE_TTL_MS",
    DEFAULT_CACHE_TTL_MS
  );
}

export function resolveSandboxCacheMaxBytes(): number {
  return readPositiveIntEnv(
    "ENGENTY_SANDBOX_CACHE_MAX_BYTES",
    DEFAULT_CACHE_MAX_BYTES
  );
}

export function resolveSandboxMaxAgeMs(): number {
  return readPositiveIntEnv(
    "ENGENTY_SANDBOX_MAX_AGE_MS",
    DEFAULT_SANDBOX_MAX_AGE_MS
  );
}

async function listDirNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    // A missing tier just means nothing has staged there yet.
    return [];
  }
}

// Directory mtime only moves when a DIRECT child changes, so a run that only
// wrote deep inside `workspace/` would look older than it is. Taking the newest
// mtime across the scope dir and its immediate children is enough to keep an
// active scope alive without walking the whole tree on every tick.
async function resolveNewestMtimeMs(dir: string): Promise<number | null> {
  try {
    const own = await stat(dir);
    let newest = own.mtimeMs;
    for (const name of await listDirNames(dir)) {
      try {
        const child = await stat(path.join(dir, name));
        newest = Math.max(newest, child.mtimeMs);
      } catch {
        // Raced with a teardown; the parent stat still bounds it.
      }
    }
    return newest;
  } catch {
    return null;
  }
}

async function resolveDirSizeBytes(dir: string): Promise<number> {
  let total = 0;
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await resolveDirSizeBytes(child);
      continue;
    }
    // Symlinks are counted at zero: the bytes belong to their target, which is
    // either inside this tree already or outside our budget entirely.
    if (!entry.isFile()) {
      continue;
    }
    try {
      total += (await stat(child)).size;
    } catch {
      // Raced with a teardown.
    }
  }
  return total;
}

async function collectLive(): Promise<{
  sandboxIds: Set<string>;
  scopeKeys: Set<string>;
}> {
  const rows = await listEngentyDockerSandboxes({ runningOnly: true });
  const scopeKeys = new Set<string>();
  const sandboxIds = new Set<string>();
  for (const row of rows) {
    const parsed = parseEngentySandboxId(row.sandbox_id);
    if (parsed) {
      scopeKeys.add(parsed.scope_key);
      sandboxIds.add(parsed.sandbox_id);
    }
  }
  return { sandboxIds, scopeKeys };
}

interface StagingCandidate {
  newestMtimeMs: number;
  scopeDir: string;
}

/**
 * Every `ai/sandboxes/<scopeKey>` dir on the host, tenant- and space-rooted.
 *
 * A run bound to a space stages under `tenants/<t>/spaces/<s>/`, one that is
 * not stages under `tenants/<t>/` — the same split `resolveLocalMountBasePath`
 * makes. Both tiers accumulate, so both are walked.
 */
async function listSandboxScopeDirs(
  root: string
): Promise<{ scopeDir: string; scopeKey: string }[]> {
  const found: { scopeDir: string; scopeKey: string }[] = [];
  const tenantsDir = path.join(root, "tenants");
  for (const tenantId of await listDirNames(tenantsDir)) {
    const tenantDir = path.join(tenantsDir, tenantId);
    const bases = [tenantDir];
    const spacesDir = path.join(tenantDir, "spaces");
    for (const spaceId of await listDirNames(spacesDir)) {
      bases.push(path.join(spacesDir, spaceId));
    }
    for (const base of bases) {
      const sandboxesDir = path.join(base, "ai", "sandboxes");
      for (const scopeKey of await listDirNames(sandboxesDir)) {
        found.push({ scopeDir: path.join(sandboxesDir, scopeKey), scopeKey });
      }
    }
  }
  return found;
}

/**
 * Every package cache on the host: `ai/cache/<tool>` for a tenant-rooted run,
 * `cache/<tool>` in the Space drive for a run bound to a space.
 */
async function listCacheDirs(root: string): Promise<string[]> {
  const found: string[] = [];
  const tools = new Set<string>(SANDBOX_CACHE_TOOLS);
  const tenantsDir = path.join(root, "tenants");
  for (const tenantId of await listDirNames(tenantsDir)) {
    const tenantDir = path.join(tenantsDir, tenantId);
    const bases = [tenantDir];
    const spacesDir = path.join(tenantDir, "spaces");
    for (const spaceId of await listDirNames(spacesDir)) {
      bases.push(path.join(spacesDir, spaceId));
    }
    const cacheDirs = [
      path.join(tenantDir, "ai", "cache"),
      ...bases.slice(1).map((spaceDir) => path.join(spaceDir, "cache")),
    ];
    for (const cacheDir of cacheDirs) {
      for (const tool of await listDirNames(cacheDir)) {
        if (tools.has(tool)) {
          found.push(path.join(cacheDir, tool));
        }
      }
    }
  }
  return found;
}

async function removeScopeDir(scopeDir: string): Promise<boolean> {
  try {
    await rm(scopeDir, { force: true, recursive: true });
    return true;
  } catch (err) {
    logger.warn("failed to reap sandbox staging dir", {
      message: err instanceof Error ? err.message : String(err),
      scopeDir,
    });
    return false;
  }
}

/**
 * Delete host staging directories left behind by finished sandboxes.
 *
 * Containers are torn down per run; their staging dirs under
 * `ai/sandboxes/<scopeKey>/` are not, and on a multi-tenant host they
 * accumulate until the disk fills. Deleting the `<scopeKey>` dir covers both
 * the `workspace/` scratch and its sibling `data/` cache in one step.
 *
 * Two passes, because age alone does not bound a disk: everything past the TTL
 * goes, then — if what is left still exceeds the budget — the oldest survivors
 * go until it fits. A dir whose container is running is never a candidate for
 * either pass.
 *
 * Scoped to `ai/sandboxes/` on purpose: the commons and home staging dirs under
 * `ai/workspace/` are caches shared across concurrent runs and may be live
 * under a bind mount right now, so they need their own in-use check. A space
 * computer's `/sandbox` is not here at all — it is a folder of the Space
 * drive, kept while the machine is stopped.
 *
 * Returns the number of scope dirs removed. Never rejects.
 */
export async function reapSandboxStagingDirs(): Promise<number> {
  const live = await collectLive();
  // Same list, second use: a holder with no container left is a leaked
  // admission slot. Piggy-backing here keeps it off a timer of its own.
  reconcileSandboxSlots(live.sandboxIds);

  // With `ENGENTY_WORKSPACE_FS=local` this root is the DURABLE store, not a
  // cache — there is no object storage behind it, so reaping would delete the
  // only copy.
  if (resolveEngentyWorkspaceFsMode() === "local") {
    return 0;
  }

  const root = resolveEngentyHostRoot();
  const scopeDirs = await listSandboxScopeDirs(root);
  const cacheDirs = await listCacheDirs(root);
  if (scopeDirs.length === 0 && cacheDirs.length === 0) {
    return 0;
  }

  // Authoritative in-use answer. Scope keys cover the per-run dirs; the shared
  // package caches carry no key, so the bind list is the only thing that can
  // say whether one is mounted right now.
  const boundHostPaths = await listEngentyDockerSandboxBinds();

  const cutoff = Date.now() - resolveSandboxStagingTtlMs();
  const survivors: StagingCandidate[] = [];
  let removed = 0;

  for (const { scopeDir, scopeKey } of scopeDirs) {
    if (live.scopeKeys.has(scopeKey) || boundHostPaths.has(scopeDir)) {
      continue;
    }
    const newestMtimeMs = await resolveNewestMtimeMs(scopeDir);
    if (newestMtimeMs === null) {
      continue;
    }
    if (newestMtimeMs <= cutoff) {
      if (await removeScopeDir(scopeDir)) {
        removed += 1;
      }
      continue;
    }
    survivors.push({ newestMtimeMs, scopeDir });
  }

  removed += await enforceBudget({
    budgetBytes: resolveSandboxStagingMaxBytes(),
    candidates: survivors,
    label: "staging",
  });
  removed += await reapCacheDirs({ boundHostPaths, cacheDirs });

  if (removed > 0) {
    logger.info("reaped sandbox staging dirs", { removed });
  }
  return removed;
}

/**
 * Age out and budget the package caches.
 *
 * A cache is deleted whole or not at all: uv, bun and npm each maintain their
 * own index inside their dir, and removing files under them by age would leave
 * an index pointing at things that are gone.
 */
async function reapCacheDirs(input: {
  boundHostPaths: Set<string>;
  cacheDirs: string[];
}): Promise<number> {
  const cutoff = Date.now() - resolveSandboxCacheTtlMs();
  const survivors: StagingCandidate[] = [];
  let removed = 0;
  for (const cacheDir of input.cacheDirs) {
    if (input.boundHostPaths.has(cacheDir)) {
      continue;
    }
    const newestMtimeMs = await resolveNewestMtimeMs(cacheDir);
    if (newestMtimeMs === null) {
      continue;
    }
    if (newestMtimeMs <= cutoff) {
      if (await removeScopeDir(cacheDir)) {
        removed += 1;
      }
      continue;
    }
    survivors.push({ newestMtimeMs, scopeDir: cacheDir });
  }
  return (
    removed +
    (await enforceBudget({
      budgetBytes: resolveSandboxCacheMaxBytes(),
      candidates: survivors,
      label: "cache",
    }))
  );
}

/**
 * Evict the oldest still-within-TTL dirs until the set fits its byte budget.
 *
 * The TTL alone cannot bound a disk: one busy day of large runs fills it long
 * before anything is a day old. Sizes are measured only for the survivors,
 * which is the set that could be evicted anyway.
 */
async function enforceBudget(input: {
  budgetBytes: number;
  candidates: StagingCandidate[];
  label: string;
}): Promise<number> {
  const budgetBytes = input.budgetBytes;
  const sized: (StagingCandidate & { sizeBytes: number })[] = [];
  let totalBytes = 0;
  for (const candidate of input.candidates) {
    const sizeBytes = await resolveDirSizeBytes(candidate.scopeDir);
    totalBytes += sizeBytes;
    sized.push({ ...candidate, sizeBytes });
  }
  if (totalBytes <= budgetBytes) {
    return 0;
  }

  sized.sort((a, b) => a.newestMtimeMs - b.newestMtimeMs);
  let removed = 0;
  let freedBytes = 0;
  for (const candidate of sized) {
    if (totalBytes - freedBytes <= budgetBytes) {
      break;
    }
    if (await removeScopeDir(candidate.scopeDir)) {
      removed += 1;
      freedBytes += candidate.sizeBytes;
    }
  }
  logger.info("evicted sandbox dirs over budget", {
    budgetBytes,
    freedBytes,
    label: input.label,
    removed,
    totalBytes,
  });
  return removed;
}

/**
 * Destroy sandbox containers that have outlived any plausible run.
 *
 * A session container is kept alive deliberately across a conversation, so age
 * is the only signal that separates "still in use" from "the run that owned
 * this died without tearing it down". The ceiling is generous for that reason —
 * this is a backstop for leaks, not a lifetime policy.
 *
 * Returns the number destroyed. Never rejects.
 */
export async function sweepAgedSandboxes(): Promise<number> {
  const maxAgeMs = resolveSandboxMaxAgeMs();
  const rows = await listEngentyDockerSandboxes({ runningOnly: true });
  let destroyed = 0;
  for (const row of rows) {
    const parsed = parseEngentySandboxId(row.sandbox_id);
    if (!parsed) {
      continue;
    }
    // Space services (computer, browser) are old by design — their container
    // and profile ARE the persistent state. The idle sweep stops the machine;
    // only Reset or space deletion removes either.
    if (parsed.lifecycle === "space" || parsed.lifecycle === "browser") {
      continue;
    }
    if (row.created_at_ms === null) {
      continue;
    }
    if (Date.now() - row.created_at_ms <= maxAgeMs) {
      continue;
    }
    try {
      await destroyEngentySandboxById(row.sandbox_id);
      destroyed += 1;
    } catch (err) {
      logger.warn("failed to destroy aged sandbox", {
        message: err instanceof Error ? err.message : String(err),
        sandboxId: row.sandbox_id,
      });
    }
  }
  if (destroyed > 0) {
    logger.info("destroyed aged sandboxes", { destroyed, maxAgeMs });
  }
  return destroyed;
}

/**
 * `core.spaces` over each tenant's own lane — the rows RLS lets that tenant
 * see, soft-deleted ones included. Null without a database.
 */
function spacesWithRowFromEnv(): SpacesWithRow | null {
  const factory = getTenantDbFactoryFromEnv();
  if (!factory) {
    return null;
  }
  return async (tenantId) => {
    const { data, error } = await factory
      .getTenantDb({ tenantId })
      .schema("core")
      .from("spaces")
      .select("id")
      .eq("tenant_id", tenantId);
    if (error) {
      throw new Error(error.message);
    }
    return new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
  };
}

/**
 * Run both reapers once at boot (to clear the backlog accumulated before they
 * existed), then hourly. The interval is `unref`'d so it cannot by itself keep
 * the process alive, and a tick never rejects — a reaper that throws must not
 * take the process with it.
 */
export function startSandboxStagingReaper(): NodeJS.Timeout {
  const tick = () => {
    void (async () => {
      // Aged containers first: destroying one frees its scope key, so its
      // staging dir becomes reapable in the same pass.
      await sweepAgedSandboxes();
      const running = await listEngentyDockerSandboxes({ runningOnly: true });
      await sweepIdleSpaceComputers(running);
      await sweepIdleUserBrowsers(running);
      await reapSandboxStagingDirs();
      const spacesWithRow = spacesWithRowFromEnv();
      if (spacesWithRow) {
        await sweepSpaceDrives({ spacesWithRow });
      }
    })().catch((err) => {
      logger.warn("sandbox staging reaper tick failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  };
  tick();
  const timer = setInterval(tick, REAP_INTERVAL_MS);
  timer.unref();
  return timer;
}
