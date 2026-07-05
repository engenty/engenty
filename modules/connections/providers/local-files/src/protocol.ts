import { z } from "zod";

/** Max bytes returned for a single read_file (larger files are rejected). */
export const MAX_FILE_BYTES = 1_000_000;
/** How long a server action waits for the browser before timing out. */
export const REQUEST_TIMEOUT_MS = 20_000;
/** A browser installation is "online" if its heartbeat is within this window. */
export const LIVENESS_WINDOW_MS = 90_000;
/** How often the browser bridge posts a heartbeat. */
export const HEARTBEAT_MS = 30_000;
/** How often the browser bridge claims pending requests (latency floor). */
export const CLAIM_POLL_MS = 3_000;

export const LOCAL_FILES_ERROR = {
  browserOffline: "local_files_browser_offline",
  fileTooLarge: "local_files_file_too_large",
  notFound: "local_files_not_found",
  permissionLost: "local_files_permission_lost",
  timeout: "local_files_timeout",
} as const;

export type LocalFilesErrorCode =
  (typeof LOCAL_FILES_ERROR)[keyof typeof LOCAL_FILES_ERROR];

/** Bridge action names carried over the request/response channel. */
export type BridgeAction = "list" | "read" | "stat" | "search";

/**
 * Validate a path relative to the granted directory root. The File System
 * Access API already prevents escaping the root (you can only descend from a
 * directory handle), but we reject traversal explicitly as defense in depth.
 * Returns the normalized segment list ([] = the root itself).
 */
export function assertSafeRelativePath(path: string): string[] {
  if (path.includes("\\")) {
    throw new Error("path must use forward slashes");
  }
  const segments = path.split("/").filter((seg) => seg.length > 0);
  for (const seg of segments) {
    if (seg === "." || seg === "..") {
      throw new Error("path may not contain '.' or '..' segments");
    }
  }
  return segments;
}

export const listInputSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  path: z.string().max(4096).default(""),
});

export const readInputSchema = z.object({
  max_bytes: z.number().int().min(1).max(MAX_FILE_BYTES).optional(),
  path: z.string().max(4096),
});

export const statInputSchema = z.object({
  path: z.string().max(4096),
});

export const searchInputSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  path: z.string().max(4096).default(""),
  query: z.string().min(1).max(256),
});

export interface LocalFileEntry {
  kind: "file" | "directory";
  modified_at: string | null;
  name: string;
  /** Path relative to the granted root. */
  path: string;
  size: number | null;
}

export interface LocalListResult {
  entries: LocalFileEntry[];
  truncated: boolean;
}

export type LocalReadResult =
  | { content: string; encoding: "utf-8"; size: number }
  | { content_base64: string; encoding: "base64"; size: number };

export interface LocalSearchResult {
  matches: LocalFileEntry[];
  truncated: boolean;
}
