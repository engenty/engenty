import {
  assertSafeRelativePath,
  type LocalFileEntry,
  type LocalListResult,
  type LocalReadResult,
  type LocalSearchResult,
  MAX_FILE_BYTES,
} from "../../src/protocol.js";

/** File System Access is Chromium-only today. */
export function isSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

interface PickerWindow {
  showDirectoryPicker?: (opts?: {
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as PickerWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error("File System Access API is not available");
  }
  return picker({ mode: "read" });
}

// queryPermission/requestPermission aren't in every lib.dom version yet.
interface Permissioned {
  queryPermission?: (d: { mode: "read" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "read" }) => Promise<PermissionState>;
}

export async function hasReadPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const q = (handle as unknown as Permissioned).queryPermission;
  if (!q) {
    return true;
  }
  return (await q.call(handle, { mode: "read" })) === "granted";
}

export async function requestReadPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const r = (handle as unknown as Permissioned).requestPermission;
  if (!r) {
    return true;
  }
  return (await r.call(handle, { mode: "read" })) === "granted";
}

async function dirAt(
  root: FileSystemDirectoryHandle,
  segments: string[]
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg);
  }
  return dir;
}

function joinPath(base: string[], name: string): string {
  return [...base, name].join("/");
}

async function entryFor(
  handle: FileSystemHandle,
  path: string
): Promise<LocalFileEntry> {
  if (handle.kind === "directory") {
    return {
      kind: "directory",
      modified_at: null,
      name: handle.name,
      path,
      size: null,
    };
  }
  const file = await (handle as FileSystemFileHandle).getFile();
  return {
    kind: "file",
    modified_at: file.lastModified
      ? new Date(file.lastModified).toISOString()
      : null,
    name: handle.name,
    path,
    size: file.size,
  };
}

export async function listDirectory(
  root: FileSystemDirectoryHandle,
  input: { limit?: number; path: string }
): Promise<LocalListResult> {
  const segments = assertSafeRelativePath(input.path);
  const dir = await dirAt(root, segments);
  const limit = input.limit ?? 200;
  const entries: LocalFileEntry[] = [];
  let truncated = false;
  // FileSystemDirectoryHandle is async-iterable over [name, handle].
  for await (const [name, handle] of dir as unknown as AsyncIterable<
    [string, FileSystemHandle]
  >) {
    if (entries.length >= limit) {
      truncated = true;
      break;
    }
    entries.push(await entryFor(handle, joinPath(segments, name)));
  }
  return { entries, truncated };
}

export async function readFile(
  root: FileSystemDirectoryHandle,
  input: { max_bytes?: number; path: string }
): Promise<LocalReadResult> {
  const segments = assertSafeRelativePath(input.path);
  if (segments.length === 0) {
    throw new Error("path is required");
  }
  const parent = await dirAt(root, segments.slice(0, -1));
  const handle = await parent.getFileHandle(segments[segments.length - 1]);
  const file = await handle.getFile();
  const cap = Math.min(input.max_bytes ?? MAX_FILE_BYTES, MAX_FILE_BYTES);
  if (file.size > cap) {
    throw new Error("local_files_file_too_large: file exceeds the size limit");
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  const sniff = buffer.subarray(0, Math.min(buffer.length, 8000));
  const isBinary = sniff.includes(0);
  if (isBinary) {
    let binary = "";
    for (const byte of buffer) {
      binary += String.fromCharCode(byte);
    }
    return {
      content_base64: btoa(binary),
      encoding: "base64",
      size: file.size,
    };
  }
  return {
    content: new TextDecoder("utf-8").decode(buffer),
    encoding: "utf-8",
    size: file.size,
  };
}

export async function statPath(
  root: FileSystemDirectoryHandle,
  input: { path: string }
): Promise<LocalFileEntry> {
  const segments = assertSafeRelativePath(input.path);
  if (segments.length === 0) {
    return {
      kind: "directory",
      modified_at: null,
      name: "",
      path: "",
      size: null,
    };
  }
  const parent = await dirAt(root, segments.slice(0, -1));
  const leaf = segments[segments.length - 1];
  try {
    const dir = await parent.getDirectoryHandle(leaf);
    return entryFor(dir, input.path);
  } catch {
    const file = await parent.getFileHandle(leaf);
    return entryFor(file, input.path);
  }
}

function matches(name: string, query: string): boolean {
  const q = query.toLowerCase();
  if (q.includes("*") || q.includes("?")) {
    const re = new RegExp(
      `^${q
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")}$`
    );
    return re.test(name.toLowerCase());
  }
  return name.toLowerCase().includes(q);
}

export async function searchFiles(
  root: FileSystemDirectoryHandle,
  input: { limit?: number; path: string; query: string }
): Promise<LocalSearchResult> {
  const segments = assertSafeRelativePath(input.path);
  const start = await dirAt(root, segments);
  const limit = input.limit ?? 100;
  const matchesOut: LocalFileEntry[] = [];
  let visited = 0;
  let truncated = false;
  const WALK_BUDGET = 5000;

  const walk = async (
    dir: FileSystemDirectoryHandle,
    prefix: string[]
  ): Promise<void> => {
    for await (const [name, handle] of dir as unknown as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if (matchesOut.length >= limit || visited >= WALK_BUDGET) {
        truncated = true;
        return;
      }
      visited += 1;
      const path = joinPath(prefix, name);
      if (matches(name, input.query)) {
        matchesOut.push(await entryFor(handle, path));
      }
      if (handle.kind === "directory") {
        await walk(handle as FileSystemDirectoryHandle, [...prefix, name]);
      }
    }
  };

  await walk(start, segments);
  return { matches: matchesOut, truncated };
}
