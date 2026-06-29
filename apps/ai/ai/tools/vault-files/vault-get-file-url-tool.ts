import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getVaultFileStorageClient } from "./lib/client.js";

export const VAULT_GET_FILE_URL_TOOL_ID = "vault_get_file_url";

export const vaultGetFileUrlTool = createTool({
  id: VAULT_GET_FILE_URL_TOOL_ID,
  description: "Get a short-lived signed read URL for a tenant vault file.",
  inputSchema: z.object({
    key: z
      .string()
      .describe("Vault object key relative to tenant or fully scoped"),
  }),
  execute: async ({ key }, context) => {
    const resolved = await getVaultFileStorageClient(context);
    if (!resolved.ok) {
      return resolved;
    }
    try {
      const scopedKey = resolved.resolveKey(key);
      const url = await resolved.client.getUrl(scopedKey);
      return { ok: true, key: scopedKey, url };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
