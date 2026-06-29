// Workspace mount filesystem backed by Mastra's official Files SDK.
//
// One `FilesSDKFilesystem` per mount, scoped to a tenant object-key prefix.
// Remote mode uses `ENGENTY_WORKSPACE_FS_PROVIDER` (default `supabase`).
// Set `ENGENTY_WORKSPACE_FS=local` only for offline tests (fs adapter mirror).
import type { WorkspaceFilesystem } from "@mastra/core/workspace";
import { FilesSDKFilesystem } from "@mastra/files-sdk";
import { createWorkspaceFilesClient } from "./workspace-fs-provider.js";

export function createWorkspaceMountFilesystem(input: {
  fileStorageRelativePath: string;
  id?: string;
  readOnly?: boolean;
  tenantId: string;
}): WorkspaceFilesystem {
  const files = createWorkspaceFilesClient({
    fileStorageRelativePath: input.fileStorageRelativePath,
    tenantId: input.tenantId,
  });
  return new FilesSDKFilesystem({
    files,
    ...(input.id ? { id: input.id } : {}),
    ...(input.readOnly ? { readOnly: true } : {}),
  });
}
