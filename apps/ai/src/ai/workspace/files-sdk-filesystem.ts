// Workspace mount filesystem backed by Mastra's official Files SDK.
//
// One `FilesSDKFilesystem` per mount, scoped to a tenant object-key prefix.
// Remote mode uses `ENGENTY_WORKSPACE_FS_PROVIDER` (default `supabase`).
// Set `ENGENTY_WORKSPACE_FS=local` only for offline tests (fs adapter mirror).
import type { WorkspaceFilesystem } from "@mastra/core/workspace";
import { FilesSDKFilesystem } from "@mastra/files-sdk";
import { Files } from "files-sdk";
import { createSpaceDataAdapter } from "./space-data-adapter.js";
import { SpaceDataFilesystem } from "./space-data-filesystem.js";
import { createWorkspaceFilesClient } from "./workspace-fs-provider.js";

export function createWorkspaceMountFilesystem(input: {
  fileStorageRelativePath: string;
  id?: string;
  readOnly?: boolean;
  spaceId?: string;
  tenantId: string;
}): WorkspaceFilesystem {
  const files = createWorkspaceFilesClient({
    fileStorageRelativePath: input.fileStorageRelativePath,
    tenantId: input.tenantId,
    ...(input.spaceId ? { spaceId: input.spaceId } : {}),
  });
  return new FilesSDKFilesystem({
    files,
    ...(input.id ? { id: input.id } : {}),
    ...(input.readOnly ? { readOnly: true } : {}),
  });
}

/**
 * The `/data` mount: the space's Data tree, as a filesystem (D4).
 *
 * Same `FilesSDKFilesystem` wrapper as every other mount — which is the point.
 * `mastra_workspace_read_file`, `mastra_workspace_list_files` and
 * `mastra_workspace_write_file` work
 * over it unchanged, and neither the tools nor the agent have to know that the
 * "objects" underneath are contacts and offers rather than bytes.
 *
 * No prefix: containment is the SPACE, enforced by the core endpoint (the tree
 * only shows what the space mounts), not by a key prefix an agent could walk
 * out of.
 */
export function createSpaceDataFilesClient(input: {
  accessToken: string;
  agentId?: string;
  coreBaseUrl: string;
  spaceId: string;
}): Files {
  return new Files({
    adapter: createSpaceDataAdapter({
      accessToken: input.accessToken,
      coreBaseUrl: input.coreBaseUrl,
      spaceId: input.spaceId,
      ...(input.agentId ? { agentId: input.agentId } : {}),
    }),
  });
}

export function createSpaceDataMountFilesystem(input: {
  accessToken: string;
  agentId?: string;
  coreBaseUrl: string;
  id?: string;
  readOnly?: boolean;
  spaceId: string;
}): WorkspaceFilesystem {
  // NOT a `FilesSDKFilesystem` any more (P1.5). That wrapper is object-storage
  // shaped: its `mkdir` is a documented no-op, so an agent that made a folder,
  // listed it, and found nothing would make it again. `SpaceDataFilesystem`
  // implements the workspace contract directly against the data endpoints,
  // where a folder is a real thing a module either has or honestly refuses.
  return new SpaceDataFilesystem({
    accessToken: input.accessToken,
    coreBaseUrl: input.coreBaseUrl,
    spaceId: input.spaceId,
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.id ? { id: input.id } : {}),
    ...(input.readOnly ? { readOnly: true } : {}),
  });
}
