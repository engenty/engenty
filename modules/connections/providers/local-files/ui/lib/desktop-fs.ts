// Native-filesystem backend for the local-files bridge, used when the SPA
// runs inside the engenty desktop shell (Tauri). Mirrors the FSA backend in
// `fsa.ts` operation-for-operation but works on absolute paths granted via
// the native folder picker, so grants survive restarts and need no
// per-session permission re-confirmation.
//
// All Tauri modules are imported dynamically: this file is part of the web
// bundle too, and must stay inert outside the desktop shell.
import {
  assertSafeRelativePath,
  type LocalDeleteResult,
  type LocalFileEntry,
  type LocalListResult,
  type LocalReadResult,
  type LocalSearchResult,
  type LocalWriteResult,
  MAX_FILE_BYTES,
} from "../../src/protocol.js";
import { matchesQuery } from "./fsa.js";

/** True inside the Tauri desktop shell (native fs available). */
export function isDesktopShell(): boolean {
  return (
    typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis
  );
}

/**
 * connection_id → absolute folder path, persisted in localStorage. The
 * desktop-shell counterpart of the IndexedDB FSA handle store: paths (unlike
 * FSA handles) are plain strings, so localStorage suffices.
 */
const DIRECTORIES_KEY = "engenty.localFiles.desktopDirectories";

function readDirectoryMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DIRECTORIES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function getDesktopDirectoryPath(connectionId: string): string | null {
  return readDirectoryMap()[connectionId] ?? null;
}

export function listDesktopDirectoryKeys(): string[] {
  return Object.keys(readDirectoryMap());
}

export function putDesktopDirectoryPath(
  connectionId: string,
  path: string
): void {
  const map = readDirectoryMap();
  map[connectionId] = path;
  localStorage.setItem(DIRECTORIES_KEY, JSON.stringify(map));
}

/** Native folder picker; resolves null when the user cancels. */
export async function pickDesktopDirectory(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choose a folder to connect",
  });
  return typeof selected === "string" ? selected : null;
}

export function directoryDisplayName(path: string): string {
  const segments = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return segments.at(-1) || path;
}

function joinAbsolute(root: string, segments: string[]): string {
  const base = root.replace(/[\\/]+$/, "");
  return segments.length > 0 ? `${base}/${segments.join("/")}` : base;
}

function toIso(value: Date | number | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function statEntry(
  absolute: string,
  name: string,
  relativePath: string
): Promise<LocalFileEntry> {
  const { stat } = await import("@tauri-apps/plugin-fs");
  const info = await stat(absolute);
  if (info.isDirectory) {
    return {
      kind: "directory",
      modified_at: null,
      name,
      path: relativePath,
      size: null,
    };
  }
  return {
    kind: "file",
    modified_at: toIso(info.mtime),
    name,
    path: relativePath,
    size: info.size,
  };
}

export async function listDirectory(
  root: string,
  input: { limit?: number; path: string }
): Promise<LocalListResult> {
  const segments = assertSafeRelativePath(input.path);
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const dirEntries = await readDir(joinAbsolute(root, segments));
  const limit = input.limit ?? 200;
  const entries: LocalFileEntry[] = [];
  let truncated = false;
  for (const dirEntry of dirEntries) {
    if (entries.length >= limit) {
      truncated = true;
      break;
    }
    const relativePath = [...segments, dirEntry.name].join("/");
    try {
      entries.push(
        await statEntry(
          joinAbsolute(root, [...segments, dirEntry.name]),
          dirEntry.name,
          relativePath
        )
      );
    } catch {
      // Broken symlink / unreadable entry: skip it, keep the listing.
    }
  }
  return { entries, truncated };
}

function decodeContent(buffer: Uint8Array, size: number): LocalReadResult {
  const sniff = buffer.subarray(0, Math.min(buffer.length, 8000));
  if (sniff.includes(0)) {
    let binary = "";
    for (const byte of buffer) {
      binary += String.fromCharCode(byte);
    }
    return { content_base64: btoa(binary), encoding: "base64", size };
  }
  return {
    content: new TextDecoder("utf-8").decode(buffer),
    encoding: "utf-8",
    size,
  };
}

export async function readFile(
  root: string,
  input: { max_bytes?: number; path: string }
): Promise<LocalReadResult> {
  const segments = assertSafeRelativePath(input.path);
  if (segments.length === 0) {
    throw new Error("path is required");
  }
  const absolute = joinAbsolute(root, segments);
  const fs = await import("@tauri-apps/plugin-fs");
  const info = await fs.stat(absolute);
  const cap = Math.min(input.max_bytes ?? MAX_FILE_BYTES, MAX_FILE_BYTES);
  if (info.size > cap) {
    throw new Error("local_files_file_too_large: file exceeds the size limit");
  }
  const buffer = await fs.readFile(absolute);
  return decodeContent(buffer, info.size);
}

export async function statPath(
  root: string,
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
  return statEntry(
    joinAbsolute(root, segments),
    segments.at(-1) ?? "",
    input.path
  );
}

export async function searchFiles(
  root: string,
  input: { limit?: number; path: string; query: string }
): Promise<LocalSearchResult> {
  const segments = assertSafeRelativePath(input.path);
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const limit = input.limit ?? 100;
  const matches: LocalFileEntry[] = [];
  let visited = 0;
  let truncated = false;
  const WALK_BUDGET = 5000;

  const walk = async (prefix: string[]): Promise<void> => {
    let dirEntries: Awaited<ReturnType<typeof readDir>>;
    try {
      dirEntries = await readDir(joinAbsolute(root, prefix));
    } catch {
      return; // unreadable subdirectory: skip, keep walking siblings
    }
    for (const dirEntry of dirEntries) {
      if (matches.length >= limit || visited >= WALK_BUDGET) {
        truncated = true;
        return;
      }
      visited += 1;
      const relativeSegments = [...prefix, dirEntry.name];
      if (matchesQuery(dirEntry.name, input.query)) {
        try {
          matches.push(
            await statEntry(
              joinAbsolute(root, relativeSegments),
              dirEntry.name,
              relativeSegments.join("/")
            )
          );
        } catch {
          // Broken symlink / unreadable entry: skip the match.
        }
      }
      if (dirEntry.isDirectory) {
        await walk(relativeSegments);
      }
    }
  };

  await walk(segments);
  return { matches, truncated };
}

export async function writeFile(
  root: string,
  input: { content_base64?: string; content_text?: string; path: string }
): Promise<LocalWriteResult> {
  const segments = assertSafeRelativePath(input.path);
  if (segments.length === 0) {
    throw new Error("path is required");
  }
  const absolute = joinAbsolute(root, segments);
  const fs = await import("@tauri-apps/plugin-fs");
  const bytes =
    typeof input.content_base64 === "string"
      ? Uint8Array.from(atob(input.content_base64), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(input.content_text ?? "");
  await fs.writeFile(absolute, bytes);
  const info = await fs.stat(absolute);
  return {
    modified_at: toIso(info.mtime),
    name: segments.at(-1) ?? input.path,
    path: input.path,
    size: info.size,
  };
}

export async function deletePath(
  root: string,
  input: { path: string }
): Promise<LocalDeleteResult> {
  const segments = assertSafeRelativePath(input.path);
  if (segments.length === 0) {
    throw new Error("path is required");
  }
  const fs = await import("@tauri-apps/plugin-fs");
  await fs.remove(joinAbsolute(root, segments));
  return { deleted: true, path: input.path };
}
