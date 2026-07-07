import { z } from "zod";
import type { ConnectorAction, ConnectorFilesCapability } from "./types.js";

/**
 * Synthesize the read actions for a connector's files capability. Each is a
 * normal `group: "read"` action, so `registerConnectorModule` projects it as a
 * gateway operation (`<toolPrefix>_files_list`, …) and the policy gate, audit,
 * approvals, and agent-tool wiring all apply with no extra code. The files
 * module also drives connected-folder mounts through the same capability.
 */
export function filesCapabilityActions(
  files: ConnectorFilesCapability,
  providerScopes?: string[]
): ConnectorAction[] {
  const scopes = providerScopes ?? [];

  const fileEntryDescription =
    "A file or folder. `ref` is the provider id to pass back as folder_ref/file_ref/ref.";

  const listAction: ConnectorAction = {
    description:
      "List one folder's immediate children. Pass folder_ref: null for the root; page with the returned next_cursor.",
    group: "read",
    id: "files_list",
    inputSchema: z.object({
      cursor: z
        .string()
        .nullish()
        .describe("Opaque pagination cursor from a prior next_cursor."),
      folder_ref: z
        .string()
        .nullable()
        .describe("Folder id to list; null lists the connection's root."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Max entries (default 100)."),
    }),
    providerScopes: scopes,
    summary: "List a folder",
    handler: (input, ctx) =>
      files.list(ctx, input as Parameters<ConnectorFilesCapability["list"]>[1]),
  };

  const readAction: ConnectorAction = {
    description: `Read a file's contents. ${fileEntryDescription} Large or binary files come back base64-encoded or as a short-lived URL.`,
    group: "read",
    id: "files_read",
    inputSchema: z.object({
      file_ref: z.string().describe("File id to read (an entry's ref)."),
      max_bytes: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Cap for proxied bytes; ignored for URL results."),
    }),
    providerScopes: scopes,
    summary: "Read a file",
    handler: (input, ctx) =>
      files.read(ctx, input as { file_ref: string; max_bytes?: number }),
  };

  const statAction: ConnectorAction = {
    description: `Get metadata for a single file or folder. ${fileEntryDescription}`,
    group: "read",
    id: "files_stat",
    inputSchema: z.object({
      ref: z.string().describe("File or folder id."),
    }),
    providerScopes: scopes,
    summary: "Stat a file or folder",
    handler: (input, ctx) => files.stat(ctx, input as { ref: string }),
  };

  const actions = [listAction, readAction, statAction];

  if (files.search) {
    const search = files.search.bind(files);
    actions.push({
      description:
        "Search files by name. Optionally scope to a folder subtree with folder_ref.",
      group: "read",
      id: "files_search",
      inputSchema: z.object({
        folder_ref: z
          .string()
          .nullish()
          .describe("Restrict the search to this folder subtree."),
        limit: z.number().int().min(1).max(200).optional(),
        query: z.string().min(1).describe("Case-insensitive name query."),
      }),
      providerScopes: scopes,
      summary: "Search files by name",
      handler: (input, ctx) =>
        search(
          ctx,
          input as { folder_ref?: string | null; limit?: number; query: string }
        ),
    });
  }

  return actions;
}
