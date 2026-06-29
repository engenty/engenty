import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getVaultFileStorageClient } from "./lib/client.js";

export const VAULT_UPLOAD_FILE_TOOL_ID = "vault_upload_file";

export const vaultUploadFileTool = createTool({
  id: VAULT_UPLOAD_FILE_TOOL_ID,
  description:
    "Upload bytes to the tenant vault at the given key. Intended for small server-side payloads.",
  inputSchema: z.object({
    key: z
      .string()
      .describe("Destination key relative to tenant or fully scoped"),
    content: z.string().describe("UTF-8 file contents"),
    content_type: z.string().optional(),
    module: z.string().optional(),
  }),
  execute: async ({ key, content, content_type, module }, context) => {
    const resolved = await getVaultFileStorageClient(context);
    if (!resolved.ok) {
      return resolved;
    }
    try {
      const scopedKey = resolved.resolveKey(key);
      const bytes = new TextEncoder().encode(content);
      await resolved.client.upload(scopedKey, bytes, {
        contentType: content_type ?? "text/plain",
        module,
        upsert: true,
      });
      return {
        ok: true,
        key: scopedKey,
        size_bytes: bytes.byteLength,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
