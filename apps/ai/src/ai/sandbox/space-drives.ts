// The Space drives on this host: one folder per Space
// (`ENGENTY_SPACES_DIR/tenants/<t>/spaces/<s>/`, see `resolveSpaceDir`).
//
// Two jobs, both on the reaper's tick:
//   - A Space core has PURGED (its `core.spaces` row is gone — a soft-deleted
//     Space keeps its row and can be restored) loses its computer, its browser
//     and its folder. Core deletes the Space's object storage and records; the
//     host folder is apps/ai's to delete, and a sweep catches every purge,
//     including ones that happened while apps/ai was down.
//   - Every other Space's folder is measured with `du`. Over the quota, its
//     package caches go first (losable by definition); what is still over is
//     reported, on the Computers view and in the log.

import { execFile } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { createLogger } from "@engenty/telemetry";

import { resolveEngentyHostRoot } from "../workspace/local-workspace-paths.js";
import { destroyEngentySandboxById } from "./destroy-engenty-sandbox.js";
import { listEngentyDockerSandboxBinds } from "./engenty-sandbox-docker.js";
import { removeSpaceEgress } from "./space-egress.js";

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: "apps/ai/space-drives" });

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SpaceDrive {
  path: string;
  spaceId: string;
  tenantId: string;
}

export interface SpaceDriveUsage {
  bytes: number;
  maxBytes: number;
  measuredAtMs: number;
}

/**
 * Every Space of the tenant that still has a row, live or soft-deleted.
 * Throws when it cannot say.
 */
export type SpacesWithRow = (tenantId: string) => Promise<Set<string>>;

export function resolveSpaceDriveMaxBytes(): number {
  const parsed = Number.parseInt(
    process.env.ENGENTY_SPACE_DRIVE_MAX_BYTES?.trim() ?? "",
    10
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
}

const usage = new Map<string, SpaceDriveUsage>();

function key(tenantId: string, spaceId: string): string {
  return `${tenantId}/${spaceId}`;
}

/** The last measurement of a Space's folder, or null before the first sweep. */
export function getSpaceDriveUsage(
  tenantId: string,
  spaceId: string
): SpaceDriveUsage | null {
  return usage.get(key(tenantId, spaceId)) ?? null;
}

async function uuidDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && UUID.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Every Space folder under the host root. Only UUID-named dirs count. */
export async function listSpaceDrives(
  root = resolveEngentyHostRoot()
): Promise<SpaceDrive[]> {
  const drives: SpaceDrive[] = [];
  const tenantsDir = path.join(root, "tenants");
  for (const tenantId of await uuidDirs(tenantsDir)) {
    const spacesDir = path.join(tenantsDir, tenantId, "spaces");
    for (const spaceId of await uuidDirs(spacesDir)) {
      drives.push({ path: path.join(spacesDir, spaceId), spaceId, tenantId });
    }
  }
  return drives;
}

/** Bytes on disk under `dir` (`du -sk`, links not followed); 0 when absent. */
export async function measureDir(dir: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("du", ["-sk", dir]);
    const kib = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? "", 10);
    return Number.isFinite(kib) ? kib * 1024 : 0;
  } catch {
    return 0;
  }
}

async function removePurged(drive: SpaceDrive): Promise<void> {
  const suffix = `${drive.tenantId}-${drive.spaceId}`;
  // Containers first: a running one would keep writing into the folder.
  for (const sandboxId of [
    `engenty-space-${suffix}`,
    `engenty-browser-${suffix}`,
  ]) {
    await destroyEngentySandboxById(sandboxId).catch(() => undefined);
  }
  await rm(drive.path, { force: true, recursive: true });
  removeSpaceEgress(drive.spaceId);
  usage.delete(key(drive.tenantId, drive.spaceId));
  logger.info("removed the folder of a purged space", {
    spaceId: drive.spaceId,
    tenantId: drive.tenantId,
  });
}

async function enforceQuota(
  drive: SpaceDrive,
  boundHostPaths: Set<string>,
  maxBytes: number
): Promise<void> {
  let bytes = await measureDir(drive.path);
  if (bytes > maxBytes) {
    const cacheDir = path.join(drive.path, "cache");
    const inUse = [...boundHostPaths].some((bound) =>
      bound.startsWith(`${cacheDir}${path.sep}`)
    );
    if (!inUse) {
      await rm(cacheDir, { force: true, recursive: true });
      bytes = await measureDir(drive.path);
    }
    if (bytes > maxBytes) {
      logger.warn("space drive over quota", {
        bytes,
        maxBytes,
        spaceId: drive.spaceId,
        tenantId: drive.tenantId,
      });
    }
  }
  usage.set(key(drive.tenantId, drive.spaceId), {
    bytes,
    maxBytes,
    measuredAtMs: Date.now(),
  });
}

/**
 * Remove the folders of purged Spaces and measure the rest. A tenant whose
 * Spaces cannot be looked up, or shows none, is skipped whole — an unanswered
 * lookup never reads as "purged". Never rejects.
 */
export async function sweepSpaceDrives(input: {
  root?: string;
  spacesWithRow: SpacesWithRow;
}): Promise<{ measured: number; removed: number }> {
  const drives = await listSpaceDrives(input.root);
  const byTenant = new Map<string, SpaceDrive[]>();
  for (const drive of drives) {
    byTenant.set(drive.tenantId, [
      ...(byTenant.get(drive.tenantId) ?? []),
      drive,
    ]);
  }
  const boundHostPaths = await listEngentyDockerSandboxBinds();
  const maxBytes = resolveSpaceDriveMaxBytes();
  let removed = 0;
  let measured = 0;
  for (const [tenantId, tenantDrives] of byTenant) {
    let withRow: Set<string>;
    try {
      withRow = await input.spacesWithRow(tenantId);
    } catch (err) {
      logger.warn("space lookup failed; tenant's drives left alone", {
        message: err instanceof Error ? err.message : String(err),
        tenantId,
      });
      continue;
    }
    // Every tenant has its default Space, so no rows at all is a lookup that
    // did not work (a lane that sees nothing), never "all purged".
    if (withRow.size === 0) {
      logger.warn("no spaces visible for tenant; its drives left alone", {
        tenantId,
      });
      continue;
    }
    for (const drive of tenantDrives) {
      try {
        if (withRow.has(drive.spaceId)) {
          await enforceQuota(drive, boundHostPaths, maxBytes);
          measured += 1;
        } else {
          await removePurged(drive);
          removed += 1;
        }
      } catch (err) {
        logger.warn("space drive sweep failed", {
          message: err instanceof Error ? err.message : String(err),
          spaceId: drive.spaceId,
          tenantId,
        });
      }
    }
  }
  return { measured, removed };
}
