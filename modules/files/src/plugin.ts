import { createConnectionsModuleClient } from "@engenty/connections-sdk";
import {
  createNativeFileSource,
  type NativeBlobStore,
} from "@engenty/file-storage";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerFileManagerRoutes } from "./api/file-manager-routes.js";
import { registerFileSourcesRoutes } from "./api/file-sources-routes.js";
import {
  createFileManagerStores,
  createFileMountStore,
} from "./dal/file-manager-store.js";
import { createCompositeFileSource } from "./sources/composite-file-source.js";
import {
  type ConnectorMountRow,
  createConnectorFileSource,
} from "./sources/connector-file-source.js";

/** Bucket the file manager stores native blobs in. */
const FILE_MANAGER_BUCKET = "files";

const registerFilesPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "files.viewer",
      title: "Files viewer",
      capabilities: ["module.files.read"],
    },
    {
      id: "files.editor",
      title: "Files editor",
      capabilities: ["module.files.read", "module.files.write"],
    },
  ]);
  const { server } = engenty;

  // Core file storage/preview routes are wired directly in
  // apps/core/src/api/routes/file-storage-routes.ts. Here we add the DB-backed
  // file manager (folders + entries) that powers per-owner file spaces such as
  // the projects "Files" tab.
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): request-shaped work runs on
  // tenant-locked handles (engenty_server lane, RLS-enforced). The service client
  // remains ONLY for the connections client's OAuth client-credential resolver
  // (platform-level settings rows carry tenant_id NULL, which the tenant lane
  // cannot see by design).
  const serviceDb = (server.getServiceDb?.() ?? null) as SupabaseClient | null;
  const getTenantDb = server.getTenantDb;
  const storage = server.getStorageService?.(FILE_MANAGER_BUCKET) ?? null;
  if (!(serviceDb && getTenantDb && storage)) {
    // CLI/boot contexts without a database adapter: file manager is unavailable.
    return;
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;

  const { folders, entries } = createFileManagerStores(getDb);
  const blobs: NativeBlobStore = {
    delete: (key) => storage.delete?.(key) ?? Promise.resolve(),
    getUrl: (key, options) => storage.getUrl(key, options),
    exists: storage.exists ? (key) => storage.exists!(key) : undefined,
  };
  const native = createNativeFileSource({ folders, entries, blobs });

  // Connector mounts: connected external folders (Drive, OneDrive, S3, local
  // browser dirs) browsable inside file spaces. Every provider call goes
  // through the connections module client, so per-connection policies apply.
  // Tenant rows (connections, policies, token refresh) resolve per call on the
  // caller's tenant-locked handle; serviceDb feeds ONLY the SDK's OAuth
  // client-credential resolver (see the seam comment above).
  const connectionsClient = createConnectionsModuleClient(
    { getDb, serviceDb },
    { moduleId: "files" }
  );
  const mounts = createFileMountStore(getDb);
  const getMount = async (
    ctx: Parameters<typeof mounts.get>[0],
    folderId: string
  ): Promise<ConnectorMountRow | null> => {
    const row = await mounts.get(ctx, folderId);
    if (!row?.connectionId) {
      return null;
    }
    return {
      connectionId: row.connectionId,
      createdAt: row.createdAt,
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      source: row.source ?? "native",
      sourceFolderId: row.sourceFolderId ?? null,
      updatedAt: row.updatedAt,
    };
  };
  const connector = createConnectorFileSource({
    client: connectionsClient,
    getMount,
  });
  const source = createCompositeFileSource({ connector, getMount, native });

  registerFileManagerRoutes(server, source);
  registerFileSourcesRoutes(server, { client: connectionsClient, mounts });
};

export default registerFilesPlugin;
