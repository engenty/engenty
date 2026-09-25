// `/company` inside a computer: a read-only copy of the company drive and of
// every publishing Space's `public/` folder, kept on the host and bound `:ro`.
//
// File tools read the same bytes straight from object storage (read-only
// Files-SDK mounts); a program in the shell cannot speak to object storage, so
// it gets this copy instead, refreshed at the start of every run.
//
// A copy that only ever adds would keep a file its Space unpublished — the one
// thing this view must not do — so every refresh also removes what is gone:
// files no longer in storage and whole folders of Spaces that stopped
// publishing.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  COMMONS_STORAGE_PREFIX,
  companyFilesPrefix,
  SPACE_PUBLIC_STORAGE_PREFIX,
  spacePublicPrefix,
} from "@engenty/file-storage";

import type { EngentyCoreFileStorageClient } from "../workspace/core-file-storage-client.js";
import {
  resolveLocalMountBasePath,
  resolveTenantLocalWorkspaceBasePath,
} from "../workspace/local-workspace-paths.js";

/** The host folder bound read-only at `/company`. */
export function resolveCompanyMirrorPath(tenantId: string): string {
  return path.join(resolveTenantLocalWorkspaceBasePath(tenantId), "company");
}

// Beside the copy, never inside it: the container would show it as a file.
function manifestPath(tenantId: string): string {
  return path.join(
    resolveTenantLocalWorkspaceBasePath(tenantId),
    "company.manifest.json"
  );
}

interface MirrorSource {
  /** Folder under `/company`: `files` or `spaces/<key>`. */
  dir: string;
  /** Host staging dir that holds the bytes when storage is local. */
  localPath: string;
  /** Full object-key prefix, ending in `/`. */
  prefix: string;
}

type Manifest = Record<string, string>;

function readManifest(tenantId: string): Manifest {
  try {
    return JSON.parse(readFileSync(manifestPath(tenantId), "utf8")) as Manifest;
  } catch {
    return {};
  }
}

function listFiles(root: string, prefix = ""): string[] {
  let entries: string[];
  try {
    entries = readdirSync(path.join(root, prefix));
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry}` : entry;
    const full = path.join(root, relative);
    if (statSync(full).isDirectory()) {
      files.push(...listFiles(root, relative));
    } else {
      files.push(relative);
    }
  }
  return files;
}

/** Remove directories left empty after their files went. */
function pruneEmptyDirs(dir: string, keepRoot: boolean): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      pruneEmptyDirs(full, false);
    }
  }
  if (!keepRoot && readdirSync(dir).length === 0) {
    rmSync(dir, { force: true, recursive: true });
  }
}

function writeAtomic(target: string, bytes: Uint8Array): void {
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.mirror-tmp`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, target);
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

async function mirrorSource(input: {
  client: EngentyCoreFileStorageClient | null;
  manifest: Manifest;
  next: Manifest;
  root: string;
  source: MirrorSource;
}): Promise<void> {
  const target = path.join(input.root, input.source.dir);
  mkdirSync(target, { recursive: true });
  const wanted = new Set<string>();
  if (input.client) {
    const listed = await input.client.list(input.source.prefix, {
      recursive: true,
    });
    for (const file of listed) {
      if (!file.key.startsWith(input.source.prefix)) {
        continue;
      }
      const relative = file.key.slice(input.source.prefix.length);
      const local = path.join(target, relative);
      if (!relative || relative.endsWith("/") || !isInside(target, local)) {
        continue;
      }
      wanted.add(relative);
      const manifestKey = `${input.source.dir}/${relative}`;
      const version = `${file.updated_at ?? ""}:${file.size_bytes ?? ""}`;
      input.next[manifestKey] = version;
      if (input.manifest[manifestKey] === version && existsSync(local)) {
        continue;
      }
      const bytes = await input.client.download(file.key);
      if (bytes) {
        writeAtomic(local, bytes);
      }
    }
  } else {
    // Local storage mode: the bytes already live in the host staging dirs.
    for (const relative of listFiles(input.source.localPath)) {
      wanted.add(relative);
      writeAtomic(
        path.join(target, relative),
        readFileSync(path.join(input.source.localPath, relative))
      );
    }
  }
  for (const relative of listFiles(target)) {
    if (!wanted.has(relative)) {
      rmSync(path.join(target, relative), { force: true });
    }
  }
  pruneEmptyDirs(target, true);
}

const inFlight = new Map<string, Promise<void>>();

/**
 * Bring the tenant's `/company` copy up to date. Runs in the same tenant are
 * serialised: two refreshes interleaving could each delete what the other
 * just wrote.
 */
export function refreshCompanyMirror(input: {
  /** Null when storage is local (`ENGENTY_WORKSPACE_FS=local`). */
  client: EngentyCoreFileStorageClient | null;
  spaces: readonly { id: string; key: string }[];
  tenantId: string;
}): Promise<void> {
  const previous = inFlight.get(input.tenantId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => refreshNow(input));
  inFlight.set(input.tenantId, run);
  return run.finally(() => {
    if (inFlight.get(input.tenantId) === run) {
      inFlight.delete(input.tenantId);
    }
  });
}

async function refreshNow(input: {
  client: EngentyCoreFileStorageClient | null;
  spaces: readonly { id: string; key: string }[];
  tenantId: string;
}): Promise<void> {
  const root = resolveCompanyMirrorPath(input.tenantId);
  mkdirSync(root, { recursive: true });
  const sources: MirrorSource[] = [
    {
      dir: "files",
      localPath: resolveLocalMountBasePath(
        input.tenantId,
        COMMONS_STORAGE_PREFIX
      ),
      prefix: companyFilesPrefix(input.tenantId),
    },
    ...input.spaces.map((space) => ({
      dir: `spaces/${space.key}`,
      localPath: resolveLocalMountBasePath(
        input.tenantId,
        SPACE_PUBLIC_STORAGE_PREFIX,
        space.id
      ),
      prefix: spacePublicPrefix(input.tenantId, space.id),
    })),
  ];
  const manifest = readManifest(input.tenantId);
  const next: Manifest = {};
  for (const source of sources) {
    await mirrorSource({ client: input.client, manifest, next, root, source });
  }
  // A Space that stopped publishing (or was renamed) takes its folder along.
  const keys = new Set(input.spaces.map((space) => space.key));
  const spacesDir = path.join(root, "spaces");
  mkdirSync(spacesDir, { recursive: true });
  for (const entry of readdirSync(spacesDir)) {
    if (!keys.has(entry)) {
      rmSync(path.join(spacesDir, entry), { force: true, recursive: true });
    }
  }
  writeAtomic(manifestPath(input.tenantId), Buffer.from(JSON.stringify(next)));
}
