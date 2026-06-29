import { type Adapter, Files } from "files-sdk";
import { fs as fsAdapter } from "files-sdk/fs";
import { supabase as supabaseAdapter } from "files-sdk/supabase";
import { createAiDatabaseAdapter } from "../../infra/database.js";
import { resolveEngentyLocalWorkspaceRoot } from "./local-workspace-paths.js";
import { resolveEngentyWorkspaceFsMode } from "./workspace-fs-mode.js";

/** Remote object-store backend for workspace Files SDK mounts. */
export type EngentyWorkspaceFsProvider = "supabase";

export function resolveEngentyWorkspaceFsProvider(
  env: Pick<NodeJS.ProcessEnv, "ENGENTY_WORKSPACE_FS_PROVIDER"> = process.env
): EngentyWorkspaceFsProvider {
  const raw = env.ENGENTY_WORKSPACE_FS_PROVIDER?.trim().toLowerCase();
  if (!raw || raw === "supabase") {
    return "supabase";
  }
  throw new Error(`unsupported_engenty_workspace_fs_provider:${raw}`);
}

export function resolveWorkspaceStorageBucket(): string {
  return process.env.ENGENTY_WORKSPACE_STORAGE_BUCKET?.trim() || "files";
}

function createSupabaseWorkspaceFilesAdapter(): Adapter {
  const supabaseClient = createAiDatabaseAdapter();
  if (!supabaseClient) {
    throw new Error(
      "workspace_fs_provider_supabase_requires_credentials: configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or set ENGENTY_WORKSPACE_FS=local for offline tests"
    );
  }
  return supabaseAdapter({
    bucket: resolveWorkspaceStorageBucket(),
    client: supabaseClient,
  });
}

/** Resolve the Files SDK adapter for workspace mounts (remote provider or local mirror). */
export function createWorkspaceFilesAdapter(): Adapter {
  if (resolveEngentyWorkspaceFsMode() === "local") {
    return fsAdapter({ root: resolveEngentyLocalWorkspaceRoot() });
  }

  switch (resolveEngentyWorkspaceFsProvider()) {
    case "supabase":
      return createSupabaseWorkspaceFilesAdapter();
  }
}

export function createWorkspaceFilesClient(input: {
  fileStorageRelativePath: string;
  tenantId: string;
}): Files {
  const segments = [
    "tenants",
    input.tenantId.trim(),
    ...input.fileStorageRelativePath.split("/").filter(Boolean),
  ];
  return new Files({
    adapter: createWorkspaceFilesAdapter(),
    prefix: `${segments.join("/")}/`,
  });
}
