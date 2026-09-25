import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  fileStorageSpaceObjectKey,
  fileStorageTenantObjectKey,
} from "@engenty/file-storage";

import type { EngentyCoreFileStorageClient } from "../workspace/core-file-storage-client.js";
import type { SandboxStorageLayout } from "./sandbox-types.js";

/**
 * Absolute object key for a synced sandbox file, through the canonical builders
 * so this stays the same layout `createWorkspaceFilesClient` produces. A
 * space-rooted mount MUST carry its space here: the relative prefix alone
 * (`ai/workspace/commons/`) is identical for every space.
 */
function syncedObjectKey(input: {
  relativePath: string;
  spaceId?: string;
  storagePrefix: string;
  tenantId: string;
}): string {
  const segments = [
    ...input.storagePrefix.split("/").filter(Boolean),
    ...input.relativePath.split("/").filter(Boolean),
  ];
  const [folder, ...rest] = segments;
  if (!folder) {
    throw new Error("sandbox_sync_storage_prefix_empty");
  }
  const spaceId = input.spaceId?.trim();
  return spaceId
    ? fileStorageSpaceObjectKey(input.tenantId.trim(), spaceId, folder, ...rest)
    : fileStorageTenantObjectKey(input.tenantId.trim(), folder, ...rest);
}

function listLocalFilesRecursive(root: string, prefix = ""): string[] {
  const absolute = prefix ? path.join(root, prefix) : root;
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry}` : entry;
    const fullPath = path.join(root, relative);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listLocalFilesRecursive(root, relative));
    } else {
      files.push(relative.replace(/\\/g, "/"));
    }
  }
  return files;
}

async function uploadLocalTree(params: {
  client: EngentyCoreFileStorageClient;
  localRoot: string;
  /** What the matching pull brought down; see {@link pushSandboxWorkspaceToStorage}. */
  pulled?: ReadonlySet<string>;
  spaceId?: string;
  storagePrefix: string;
  tenantId: string;
}): Promise<Set<string>> {
  const files = listLocalFilesRecursive(params.localRoot);
  const present = new Set(files);
  for (const relativePath of params.pulled ?? []) {
    if (present.has(relativePath)) {
      continue;
    }
    const key = syncedObjectKey({
      relativePath,
      storagePrefix: params.storagePrefix,
      tenantId: params.tenantId,
      ...(params.spaceId ? { spaceId: params.spaceId } : {}),
    });
    // Another run on the same computer may have removed it first.
    await params.client.delete(key).catch(() => undefined);
  }
  for (const relativePath of files) {
    const bytes = readFileSync(path.join(params.localRoot, relativePath));
    const key = syncedObjectKey({
      relativePath,
      storagePrefix: params.storagePrefix,
      tenantId: params.tenantId,
      ...(params.spaceId ? { spaceId: params.spaceId } : {}),
    });
    await params.client.upload(key, bytes, { upsert: true });
  }
  return present;
}

async function downloadStorageTree(params: {
  client: EngentyCoreFileStorageClient;
  localRoot: string;
  spaceId?: string;
  storagePrefix: string;
  tenantId: string;
}): Promise<Set<string>> {
  mkdirSync(params.localRoot, { recursive: true });
  const pulled = new Set<string>();
  const prefix = syncedObjectKey({
    relativePath: "",
    storagePrefix: params.storagePrefix,
    tenantId: params.tenantId,
    ...(params.spaceId ? { spaceId: params.spaceId } : {}),
  });
  const listed = await params.client.list(prefix, { recursive: true });
  for (const file of listed) {
    if (!file.key.startsWith(prefix)) {
      continue;
    }
    const relative = file.key.slice(prefix.length).replace(/^\/+/, "");
    if (!relative || relative.endsWith("/")) {
      continue;
    }
    const bytes = await params.client.download(file.key);
    if (!bytes) {
      continue;
    }
    const target = path.join(params.localRoot, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    pulled.add(relative);
  }
  return pulled;
}

/** Pull a layout's files; returns the relative paths it brought down. */
export async function pullSandboxWorkspaceFromStorage(params: {
  client: EngentyCoreFileStorageClient;
  layout: SandboxStorageLayout;
  tenantId: string;
}): Promise<Set<string>> {
  return await downloadStorageTree({
    client: params.client,
    localRoot: params.layout.stagingPath,
    storagePrefix: params.layout.fileStorageRelativePath,
    tenantId: params.tenantId,
    ...(params.layout.spaceId ? { spaceId: params.layout.spaceId } : {}),
  });
}

/**
 * Push a layout's files. A file the pull brought down that is gone locally
 * was deleted during the run, and is deleted in storage too — without that a
 * deletion lasted only until the next pull, and a file taken out of
 * `/space/public` stayed published.
 */
export async function pushSandboxWorkspaceToStorage(params: {
  client: EngentyCoreFileStorageClient;
  layout: SandboxStorageLayout;
  pulled?: ReadonlySet<string>;
  tenantId: string;
}): Promise<Set<string>> {
  return await uploadLocalTree({
    client: params.client,
    localRoot: params.layout.stagingPath,
    ...(params.pulled ? { pulled: params.pulled } : {}),
    storagePrefix: params.layout.fileStorageRelativePath,
    tenantId: params.tenantId,
    ...(params.layout.spaceId ? { spaceId: params.layout.spaceId } : {}),
  });
}
