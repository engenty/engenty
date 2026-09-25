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
//
// `apps/<slug>/` is copied from the App's source on this host (app-host's
// tree, never in object storage), without `.git`, `node_modules` or symlinks:
// the history and the installs are the owning Space's, and a link could
// point anywhere on the host.

import {
  existsSync,
  lstatSync,
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
  /** Folder under `/company`: `files`, `spaces/<key>` or `apps/<slug>`. */
  dir: string;
  /** Host dir that holds the bytes when storage is local (always, for Apps). */
  localPath: string;
  /** Full object-key prefix, ending in `/`; absent for a host-only source. */
  prefix?: string;
}

// Never copied out of an App's source tree.
const SKIPPED_DIRS = new Set([".git", "node_modules"]);

type Manifest = Record<string, string>;

function readManifest(tenantId: string): Manifest {
  try {
    return JSON.parse(readFileSync(manifestPath(tenantId), "utf8")) as Manifest;
  } catch {
    return {};
  }
}

/** Regular files under `root`, relative; symlinks and skipped dirs left out. */
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
    const stat = lstatSync(path.join(root, relative));
    if (stat.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry)) {
        files.push(...listFiles(root, relative));
      }
    } else if (stat.isFile()) {
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
  const prefix = input.source.prefix;
  if (input.client && prefix) {
    const listed = await input.client.list(prefix, {
      recursive: true,
    });
    for (const file of listed) {
      if (!file.key.startsWith(prefix)) {
        continue;
      }
      const relative = file.key.slice(prefix.length);
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
    // Local storage mode, or an App's source: the bytes are on this host.
    for (const relative of listFiles(input.source.localPath)) {
      wanted.add(relative);
      const from = path.join(input.source.localPath, relative);
      const to = path.join(target, relative);
      const { mtimeMs, size } = statSync(from);
      const manifestKey = `${input.source.dir}/${relative}`;
      const version = `${mtimeMs}:${size}`;
      input.next[manifestKey] = version;
      if (input.manifest[manifestKey] === version && existsSync(to)) {
        continue;
      }
      writeAtomic(to, readFileSync(from));
    }
  }
  for (const relative of listFiles(target)) {
    if (!wanted.has(relative)) {
      rmSync(path.join(target, relative), { force: true });
    }
  }
  pruneEmptyDirs(target, true);
}

function removeUnlisted(dir: string, keep: ReadonlySet<string>): void {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) {
    if (!keep.has(entry)) {
      rmSync(path.join(dir, entry), { force: true, recursive: true });
    }
  }
}

const inFlight = new Map<string, Promise<void>>();

/**
 * Bring the tenant's `/company` copy up to date. Runs in the same tenant are
 * serialised: two refreshes interleaving could each delete what the other
 * just wrote.
 */
export function refreshCompanyMirror(input: {
  /** The Apps whose source `/company/apps/<slug>` shows. */
  apps?: readonly { slug: string; srcPath: string }[];
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
  apps?: readonly { slug: string; srcPath: string }[];
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
    ...(input.apps ?? []).map((app) => ({
      dir: `apps/${app.slug}`,
      localPath: app.srcPath,
    })),
  ];
  const manifest = readManifest(input.tenantId);
  const next: Manifest = {};
  for (const source of sources) {
    await mirrorSource({ client: input.client, manifest, next, root, source });
  }
  // A Space that stopped publishing (or was renamed) takes its folder along,
  // and an App that was removed or whose Space stopped publishing, its source.
  removeUnlisted(
    path.join(root, "spaces"),
    new Set(input.spaces.map((space) => space.key))
  );
  removeUnlisted(
    path.join(root, "apps"),
    new Set((input.apps ?? []).map((app) => app.slug))
  );
  writeAtomic(manifestPath(input.tenantId), Buffer.from(JSON.stringify(next)));
}
