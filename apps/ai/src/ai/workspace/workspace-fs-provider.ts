import { type Adapter, Files } from "files-sdk";
import { fs as fsAdapter } from "files-sdk/fs";
import { supabase as supabaseAdapter } from "files-sdk/supabase";
import { createAiDatabaseAdapter } from "../../infra/database.js";
import { resolveEngentyHostRoot } from "./local-workspace-paths.js";
import { resolveEngentyWorkspaceFsMode } from "./workspace-fs-mode.js";

/** Remote object-store backend for workspace Files SDK mounts. */
export type EngentyWorkspaceFsProvider = "supabase";

export function resolveEngentyWorkspaceFsProvider(
  env: Partial<
    Pick<NodeJS.ProcessEnv, "ENGENTY_WORKSPACE_FS_PROVIDER">
  > = process.env
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
  // SERVICE lane (Phase A residual, on purpose): this client talks to the
  // Supabase STORAGE API (bucket objects), not PostgREST tables. The
  // engenty_server role has no grants on the storage schema (the Phase A
  // migration covers module_*/core/ai/search/context_graph/public only), so a
  // tenant-locked handle would fail closed here. Tenant containment is the
  // `tenants/<tenantId>/…` prefix set in createWorkspaceFilesClient; moving
  // storage onto the tenant lane needs storage.objects policies of its own.
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
    return fsAdapter({ root: resolveEngentyHostRoot() });
  }

  switch (resolveEngentyWorkspaceFsProvider()) {
    case "supabase":
      return createSupabaseWorkspaceFilesAdapter();
  }
}

/**
 * The Files client for one mount. `spaceId` inserts the space boundary between
 * the tenant and the module folder (`tenants/<t>/spaces/<s>/…`), which is what
 * makes containment structural: a mount rooted in space A has no path that
 * reaches space B. Absent → tenant root, unchanged.
 */
export function createWorkspaceFilesClient(input: {
  fileStorageRelativePath: string;
  spaceId?: string;
  tenantId: string;
}): Files {
  const spaceId = input.spaceId?.trim();
  const segments = [
    "tenants",
    input.tenantId.trim(),
    ...(spaceId ? ["spaces", spaceId] : []),
    ...input.fileStorageRelativePath.split("/").filter(Boolean),
  ];
  return new Files({
    adapter: createWorkspaceFilesAdapter(),
    prefix: `${segments.join("/")}/`,
  });
}
