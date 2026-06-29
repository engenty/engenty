import { vaultDeleteFileTool } from "./vault-delete-file-tool.js";
import { vaultDownloadFileTool } from "./vault-download-file-tool.js";
import { vaultGetFileUrlTool } from "./vault-get-file-url-tool.js";
import { vaultListFilesTool } from "./vault-list-files-tool.js";
import { vaultUploadFileTool } from "./vault-upload-file-tool.js";

export function createVaultFileTools() {
  return {
    vault_delete_file: vaultDeleteFileTool,
    vault_download_file: vaultDownloadFileTool,
    vault_get_file_url: vaultGetFileUrlTool,
    vault_list_files: vaultListFilesTool,
    vault_upload_file: vaultUploadFileTool,
  };
}
