import { vaultDeleteFileTool } from "./vault-delete-file-tool.js";
import { vaultDownloadFileTool } from "./vault-download-file-tool.js";
import { vaultFilesTool } from "./vault-files-tool.js";
import { vaultGetFileUrlTool } from "./vault-get-file-url-tool.js";
import { vaultListFilesTool } from "./vault-list-files-tool.js";
import { vaultUploadFileTool } from "./vault-upload-file-tool.js";

/**
 * All vault tools, granular AND combined.
 *
 * `vault_files` (one tool, `action` discriminator) is what the copilot and the
 * CLI agent carry — five schemas in every prompt was a poor trade for a
 * capability most turns never use. The granular five stay registered for agents
 * that reference them by name (file-analyst) and as the implementation the
 * combined tool dispatches to.
 */
export function createVaultFileTools() {
  return {
    vault_files: vaultFilesTool,
    vault_delete_file: vaultDeleteFileTool,
    vault_download_file: vaultDownloadFileTool,
    vault_get_file_url: vaultGetFileUrlTool,
    vault_list_files: vaultListFilesTool,
    vault_upload_file: vaultUploadFileTool,
  };
}
