// Scoped workspace file tools for task-job specialists. Validated server-side
// against the task workspace prefix and (when present) the routine workspace
// prefix — reject traversal, absolute keys, and foreign prefixes.

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getEngentyCoreBaseUrlFromEnv } from "../../../src/ai/core-http-client.js";
import { createEngentyCoreFileStorageClient } from "../../../src/ai/workspace/core-file-storage-client.js";
import { resolveEngentyToolsRunContext } from "../engenty-tools/lib/run-context.js";

export const WORKSPACE_READ_FILE_TOOL_ID = "workspace_read_file";
export const WORKSPACE_WRITE_FILE_TOOL_ID = "workspace_write_file";
export const WORKSPACE_LIST_FILES_TOOL_ID = "workspace_list_files";

const MAX_READ_BYTES = 256 * 1024;
const MAX_WRITE_BYTES = 256 * 1024;
const MAX_LIST_FILES = 100;

// The workspace folders, most specific first — a relative path resolves into
// the FIRST prefix; the others stay reachable by full `tenants/…` key.
const PREFIX_ORDER_NOTE =
  "Prefixes, most specific first: routine (if this is a routine run), task, goal (if linked), project (if linked), then shared commons. A relative path resolves into the FIRST prefix; reach the others with a full tenants/… key.";

export interface WorkspaceFileToolScope {
  /** Absolute storage prefixes that are allowed (must end with `/`). */
  allowedPrefixes: string[];
}

/** Resolve a relative or absolute key into a full object key inside an allowed prefix. */
export function resolveWorkspaceObjectKey(
  key: string,
  allowedPrefixes: string[]
): string {
  // Absolute paths are never workspace-relative — reject them outright rather
  // than silently reinterpreting `/etc/passwd` as a file inside a prefix.
  if (key.trim().startsWith("/")) {
    throw new Error("workspace_key_forbidden");
  }
  const normalized = key.replace(/^\/+/, "").trim();
  if (!normalized || normalized.includes("..")) {
    throw new Error("workspace_key_invalid");
  }
  // Already a full tenants/… key — must sit under an allowed prefix.
  if (normalized.startsWith("tenants/")) {
    const ok = allowedPrefixes.some(
      (prefix) =>
        normalized === prefix.replace(/\/$/, "") ||
        normalized.startsWith(prefix)
    );
    if (!ok) {
      throw new Error("workspace_key_forbidden");
    }
    return normalized;
  }
  // Relative path: try each allowed prefix (prefer first match that works —
  // callers usually pass task then routine).
  for (const prefix of allowedPrefixes) {
    const candidate = `${prefix.replace(/\/?$/, "/")}${normalized}`.replace(
      /\/+/g,
      "/"
    );
    if (
      candidate.startsWith(prefix) ||
      candidate.startsWith(prefix.replace(/\/$/, ""))
    ) {
      return candidate;
    }
  }
  throw new Error("workspace_key_forbidden");
}

function storageClientFromRun() {
  const runContext = resolveEngentyToolsRunContext();
  const coreBaseUrl = runContext.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
  const accessToken = runContext.accessToken?.trim();
  if (!(coreBaseUrl && accessToken)) {
    return null;
  }
  return createEngentyCoreFileStorageClient({
    bucket: "files",
    coreBaseUrl,
    fetchImpl: runContext.fetchImpl,
    accessToken,
  });
}

export function createWorkspaceFileTools(scope: WorkspaceFileToolScope) {
  const prefixes = scope.allowedPrefixes
    .map((p) => (p.endsWith("/") ? p : `${p}/`))
    .filter(Boolean);

  const workspace_read_file = createTool({
    id: WORKSPACE_READ_FILE_TOOL_ID,
    description: `Read a text file from your workspace. Pass a path relative to the workspace (e.g. state.md) or a full tenants/… key. ${PREFIX_ORDER_NOTE}`,
    inputSchema: z.object({
      path: z.string().min(1).max(1024),
    }),
    execute: async (input) => {
      if (prefixes.length === 0) {
        return { ok: false as const, error: "workspace_unavailable" };
      }
      let key: string;
      try {
        key = resolveWorkspaceObjectKey(input.path, prefixes);
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error ? error.message : "workspace_key_invalid",
        };
      }
      const client = storageClientFromRun();
      if (!client) {
        return { ok: false as const, error: "service_unavailable" };
      }
      const bytes = await client.download(key);
      if (!bytes) {
        return { ok: false as const, error: "not_found", key };
      }
      const clipped =
        bytes.byteLength > MAX_READ_BYTES
          ? bytes.subarray(0, MAX_READ_BYTES)
          : bytes;
      const text = new TextDecoder("utf-8", { fatal: false }).decode(clipped);
      return {
        ok: true as const,
        key,
        text,
        truncated: bytes.byteLength > MAX_READ_BYTES,
      };
    },
  });

  const workspace_write_file = createTool({
    id: WORKSPACE_WRITE_FILE_TOOL_ID,
    description: `Write a text file into your workspace. A relative path lands in the most-specific prefix. ${PREFIX_ORDER_NOTE}`,
    inputSchema: z.object({
      content: z.string().max(MAX_WRITE_BYTES),
      path: z.string().min(1).max(1024),
    }),
    execute: async (input) => {
      if (prefixes.length === 0) {
        return { ok: false as const, error: "workspace_unavailable" };
      }
      let key: string;
      try {
        key = resolveWorkspaceObjectKey(input.path, prefixes);
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error ? error.message : "workspace_key_invalid",
        };
      }
      const encoded = new TextEncoder().encode(input.content);
      if (encoded.byteLength > MAX_WRITE_BYTES) {
        return { ok: false as const, error: "content_too_large" };
      }
      const client = storageClientFromRun();
      if (!client) {
        return { ok: false as const, error: "service_unavailable" };
      }
      await client.upload(key, encoded, {
        contentType: "text/plain; charset=utf-8",
        upsert: true,
      });
      return { ok: true as const, key, bytes: encoded.byteLength };
    },
  });

  const workspace_list_files = createTool({
    id: WORKSPACE_LIST_FILES_TOOL_ID,
    description: `List files in your workspace. With no path, lists every workspace folder; with a path, lists under that folder. ${PREFIX_ORDER_NOTE}`,
    inputSchema: z.object({
      path: z.string().max(1024).optional(),
    }),
    execute: async (input) => {
      if (prefixes.length === 0) {
        return { ok: false as const, error: "workspace_unavailable" };
      }
      let targets: string[];
      const path = input.path?.trim();
      if (path) {
        let key: string;
        try {
          key = resolveWorkspaceObjectKey(path, prefixes);
        } catch (error) {
          return {
            ok: false as const,
            error:
              error instanceof Error ? error.message : "workspace_key_invalid",
          };
        }
        targets = [key.endsWith("/") ? key : `${key}/`];
      } else {
        targets = prefixes;
      }
      const client = storageClientFromRun();
      if (!client) {
        return { ok: false as const, error: "service_unavailable" };
      }
      const files: Array<{
        key: string;
        size_bytes: number | null;
        updated_at: string | null;
      }> = [];
      for (const prefix of targets) {
        const listed = await client.list(prefix, { limit: MAX_LIST_FILES });
        for (const file of listed) {
          files.push({
            key: file.key,
            size_bytes: file.size_bytes ?? null,
            updated_at: file.updated_at ?? null,
          });
        }
      }
      return { ok: true as const, files };
    },
  });

  return {
    workspace_read_file,
    workspace_write_file,
    workspace_list_files,
  };
}
