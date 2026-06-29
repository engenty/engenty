import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { EngentyCoreFileStorageClient } from "../workspace/core-file-storage-client.js";
import type { SandboxStorageLayout } from "./sandbox-types.js";

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
  storagePrefix: string;
  tenantId: string;
}): Promise<void> {
  const files = listLocalFilesRecursive(params.localRoot);
  for (const relativePath of files) {
    const bytes = readFileSync(path.join(params.localRoot, relativePath));
    const key = `tenants/${params.tenantId.trim()}/${params.storagePrefix.replace(/\/+$/, "")}/${relativePath}`;
    await params.client.upload(key, bytes, { upsert: true });
  }
}

async function downloadStorageTree(params: {
  client: EngentyCoreFileStorageClient;
  localRoot: string;
  storagePrefix: string;
  tenantId: string;
}): Promise<void> {
  mkdirSync(params.localRoot, { recursive: true });
  const prefix = `tenants/${params.tenantId.trim()}/${params.storagePrefix.replace(/\/+$/, "")}`;
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
  }
}

export async function pullSandboxWorkspaceFromStorage(params: {
  client: EngentyCoreFileStorageClient;
  layout: SandboxStorageLayout;
  tenantId: string;
}): Promise<void> {
  await downloadStorageTree({
    client: params.client,
    localRoot: params.layout.stagingPath,
    storagePrefix: params.layout.fileStorageRelativePath,
    tenantId: params.tenantId,
  });
}

export async function pushSandboxWorkspaceToStorage(params: {
  client: EngentyCoreFileStorageClient;
  layout: SandboxStorageLayout;
  tenantId: string;
}): Promise<void> {
  await uploadLocalTree({
    client: params.client,
    localRoot: params.layout.stagingPath,
    storagePrefix: params.layout.fileStorageRelativePath,
    tenantId: params.tenantId,
  });
}
