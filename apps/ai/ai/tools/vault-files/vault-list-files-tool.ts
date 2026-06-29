import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getVaultFileStorageClient } from "./lib/client.js";
import { resolveVaultTenantPrefix } from "./lib/key-scope.js";

export const VAULT_LIST_FILES_TOOL_ID = "vault_list_files";

export const vaultListFilesTool = createTool({
  id: VAULT_LIST_FILES_TOOL_ID,
  description:
    "List tenant vault files under a prefix. Use for cross-module storage discovery outside agent workspace mounts.",
  inputSchema: z.object({
    prefix: z
      .string()
      .optional()
      .describe(
        "Relative prefix under the current tenant, e.g. knowledge-base/my-kb"
      ),
    limit: z.number().int().positive().max(200).optional(),
  }),
  execute: async ({ prefix, limit }, context) => {
    const resolved = await getVaultFileStorageClient(context);
    if (!resolved.ok) {
      return resolved;
    }
    try {
      const scopedPrefix = prefix
        ? resolved.resolveKey(prefix)
        : resolveVaultTenantPrefix(resolved.tenantId);
      const files = await resolved.client.list(scopedPrefix, {
        limit: limit ?? 50,
      });
      return {
        ok: true,
        prefix: scopedPrefix,
        files: files.map((file) => ({
          filename: file.filename,
          key: file.key,
          mime_type: file.mime_type,
          module: file.module,
          size_bytes: file.size_bytes,
        })),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
