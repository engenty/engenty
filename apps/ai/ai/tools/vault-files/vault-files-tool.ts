import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { vaultDeleteFileTool } from "./vault-delete-file-tool.js";
import { vaultDownloadFileTool } from "./vault-download-file-tool.js";
import { vaultGetFileUrlTool } from "./vault-get-file-url-tool.js";
import { vaultListFilesTool } from "./vault-list-files-tool.js";
import { vaultUploadFileTool } from "./vault-upload-file-tool.js";

export const VAULT_FILES_TOOL_ID = "vault_files";

/**
 * One tool over the whole tenant vault, dispatching on `action`.
 *
 * The five granular tools (`vault_list_files` / `_upload_file` /
 * `_download_file` / `_get_file_url` / `_delete_file`) still exist and are what
 * the file-analyst carries. But on the copilot they were five schemas in every
 * prompt on every model call, for a capability most turns never touch — and
 * four of the five take nothing but a key.
 *
 * The granular tools remain the implementation: this dispatches to their
 * `execute`, so behaviour, key scoping and the delete confirmation gate are
 * defined in exactly one place.
 */
export const vaultFilesTool = createTool({
  id: VAULT_FILES_TOOL_ID,
  description:
    "Tenant vault storage (Speicher) — files outside the agent workspace mounts. action='list' (prefix, limit) lists files; 'download' (key) returns text or base64; 'url' (key) returns a short-lived signed read URL; 'upload' (key, content, content_type?, module?) writes UTF-8 bytes; 'delete' (key, confirmed=true) removes a file and is destructive, so ask the operator first. Prefer the workspace filesystem under ai/workspace/ for task and copilot paths.",
  inputSchema: z.object({
    action: z.enum(["list", "download", "url", "upload", "delete"]),
    confirmed: z
      .boolean()
      .optional()
      .describe("Required true for action='delete'"),
    content: z.string().optional().describe("UTF-8 contents for 'upload'"),
    content_type: z.string().optional(),
    key: z
      .string()
      .optional()
      .describe("Vault object key, relative to the tenant or fully scoped"),
    limit: z.number().int().positive().max(200).optional(),
    module: z.string().optional(),
    prefix: z.string().optional().describe("Relative prefix for 'list'"),
  }),
  execute: async (input, context) => {
    // `execute` is optional on the Mastra tool type; these five always define
    // it, and a missing one is a wiring bug worth failing loudly on.
    const run = (
      tool: { execute?: (args: never, ctx: never) => unknown },
      args: unknown
    ) => {
      if (!tool.execute) {
        throw new Error("vault_files: underlying tool has no execute");
      }
      return tool.execute(args as never, context as never);
    };
    const requireKey = () => {
      if (!input.key) {
        throw new Error(`vault_files: action='${input.action}' requires key`);
      }
      return input.key;
    };
    switch (input.action) {
      case "list":
        return await run(vaultListFilesTool, {
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          ...(input.prefix === undefined ? {} : { prefix: input.prefix }),
        });
      case "download":
        return await run(vaultDownloadFileTool, { key: requireKey() });
      case "url":
        return await run(vaultGetFileUrlTool, { key: requireKey() });
      case "upload": {
        if (input.content === undefined) {
          throw new Error("vault_files: action='upload' requires content");
        }
        return await run(vaultUploadFileTool, {
          content: input.content,
          key: requireKey(),
          ...(input.content_type === undefined
            ? {}
            : { content_type: input.content_type }),
          ...(input.module === undefined ? {} : { module: input.module }),
        });
      }
      default:
        // Confirmation stays the delete tool's own gate — duplicating it here
        // would leave two places that can disagree about what "approved" means.
        return await run(vaultDeleteFileTool, {
          confirmed: input.confirmed === true,
          key: requireKey(),
        });
    }
  },
});
