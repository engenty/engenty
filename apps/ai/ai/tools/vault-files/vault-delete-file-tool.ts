import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getVaultFileStorageClient } from "./lib/client.js";

export const VAULT_DELETE_FILE_TOOL_ID = "vault_delete_file";

export const vaultDeleteFileTool = createTool({
  id: VAULT_DELETE_FILE_TOOL_ID,
  description:
    "Delete a tenant vault file. Requires confirmed=true because the action is destructive.",
  inputSchema: z.object({
    key: z
      .string()
      .describe("Vault object key relative to tenant or fully scoped"),
    confirmed: z
      .boolean()
      .describe("Must be true after the operator approves deletion"),
  }),
  execute: async ({ key, confirmed }, context) => {
    if (!confirmed) {
      return {
        ok: false,
        code: "confirmation_required",
        message:
          "Set confirmed=true after the operator approves vault file deletion.",
      };
    }
    const resolved = await getVaultFileStorageClient(context);
    if (!resolved.ok) {
      return resolved;
    }
    try {
      const scopedKey = resolved.resolveKey(key);
      await resolved.client.delete(scopedKey);
      return { ok: true, key: scopedKey, deleted: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
