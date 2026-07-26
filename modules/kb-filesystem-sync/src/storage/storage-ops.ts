/**
 * Storage primitives for the sync module. The SDK `StorageService.list` is
 * prefix-shallow, so `walkKeys` recurses the tree itself (mirroring the core
 * file-storage route walker).
 */

import type { StorageService } from "@engenty/plugin-sdk";

/** Narrowed view of a `list` entry — the SDK types files as `unknown[]`. */
interface ListedFile {
  filename: string;
  key: string;
  size_bytes: number;
}

const MARKDOWN = "text/markdown";
const MAX_DEPTH = 20;

export async function writeText(
  storage: StorageService,
  key: string,
  content: string
): Promise<void> {
  await storage.upload(key, new TextEncoder().encode(content), {
    contentType: MARKDOWN,
    upsert: true,
  });
}

export async function readText(
  storage: StorageService,
  key: string
): Promise<string | null> {
  const bytes = await storage.download(key);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

function hasExtension(filename: string): boolean {
  return /\.[a-z0-9]{1,10}$/i.test(filename);
}

/** Recursively collect every file key under `prefix` (directories excluded). */
export async function walkKeys(
  storage: StorageService,
  prefix: string
): Promise<string[]> {
  if (!storage.list) {
    return [];
  }
  const out: string[] = [];
  let dirs = [prefix];
  for (let depth = 0; depth < MAX_DEPTH && dirs.length > 0; depth++) {
    const next: string[] = [];
    for (const dir of dirs) {
      const result = await storage.list(dir, { limit: 1000 });
      for (const raw of result.files as ListedFile[]) {
        const isDir = !hasExtension(raw.filename) && raw.size_bytes === 0;
        if (isDir) {
          next.push(raw.key);
        } else {
          out.push(raw.key);
        }
      }
    }
    dirs = next;
  }
  return out;
}

/** Best-effort delete of every file under a prefix. */
export async function deletePrefix(
  storage: StorageService,
  prefix: string
): Promise<number> {
  if (!storage.delete) {
    return 0;
  }
  const keys = await walkKeys(storage, prefix);
  let deleted = 0;
  for (const key of keys) {
    await storage.delete(key);
    deleted++;
  }
  return deleted;
}
