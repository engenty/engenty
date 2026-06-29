import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getVaultFileStorageClient } from "./lib/client.js";

export const VAULT_DOWNLOAD_FILE_TOOL_ID = "vault_download_file";

const MAX_INLINE_BYTES = 256 * 1024;

export const vaultDownloadFileTool = createTool({
  id: VAULT_DOWNLOAD_FILE_TOOL_ID,
  description:
    "Download a tenant vault file by key. Returns UTF-8 text for small text-like files or base64 for binary payloads.",
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
      const bytes = await resolved.client.download(scopedKey);
      if (!bytes) {
        return { ok: false, error: "file_not_found", key: scopedKey };
      }
      if (bytes.byteLength > MAX_INLINE_BYTES) {
        return {
          ok: true,
          key: scopedKey,
          size_bytes: bytes.byteLength,
          encoding: "base64",
          truncated: true,
          content: Buffer.from(bytes.slice(0, MAX_INLINE_BYTES)).toString(
            "base64"
          ),
        };
      }
      return {
        ok: true,
        key: scopedKey,
        size_bytes: bytes.byteLength,
        encoding: "utf8",
        content: new TextDecoder().decode(bytes),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
