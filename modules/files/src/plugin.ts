import {
  createConnectionsModuleClient,
  resolveSpaceRecordAccounts,
} from "@engenty/connections-sdk";
import {
  createNativeFileSource,
  type FileSourceContext,
  FileSourceNotFoundError,
  type NativeBlobStore,
} from "@engenty/file-storage";
import { type EngentyPluginFactory, foreignSelect } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ResolveOwnerSpaceId,
  registerFileManagerRoutes,
} from "./api/file-manager-routes.js";
import { registerFileShortcutsRoutes } from "./api/file-shortcuts-routes.js";
import { registerFileSourcesRoutes } from "./api/file-sources-routes.js";
import { registerSpaceFileOperations } from "./api/space-file-operations.js";
import {
  createFileManagerStores,
  createFileMountStore,
} from "./dal/file-manager-store.js";
import { createFileShortcutsStore } from "./dal/file-shortcuts-store.js";
import { createCompositeFileSource } from "./sources/composite-file-source.js";
import {
  type ConnectorMountRow,
  createConnectorFileSource,
} from "./sources/connector-file-source.js";
import { createFilesSpaceDataAdapter } from "./space-data/adapter.js";

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
    // `upsert` is the point: replacing content writes over the key the entry
    // already owns, so rename and move stay pure metadata updates.
    upload: async (key, data, options) => {
      await storage.upload(key, data, { ...options, upsert: true });
    },
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
  // A drive belongs to one Space: only that Space's own Files may use it
  // (PLAN-space-owned-connections.md). Project and other file spaces mount no
  // drives.
  const assertConnectionUsable = async (
    ctx: FileSourceContext,
    connectionId: string
  ): Promise<void> => {
    const owned =
      ctx.owner.type === "space"
        ? await resolveSpaceRecordAccounts(getDb(ctx), {
            spaceId: ctx.owner.id,
            tenantId: ctx.tenantId,
          })
        : null;
    if (!owned?.has(connectionId)) {
      throw new FileSourceNotFoundError(
        "That connected drive belongs to another Space"
      );
    }
  };
  const connector = createConnectorFileSource({
    assertConnectionUsable,
    client: connectionsClient,
    getMount,
  });
  const source = createCompositeFileSource({ connector, getMount, native });

  /**
   * Which space an owner's bytes are rooted in (PLAN-spaces.md §1b).
   *
   * A `project` owner answers from `module_projects.projects.space_id`, which
   * is `not null` since Phase 6. Read through `foreignSelect` because this
   * crosses a schema boundary on a tenant-locked handle — the tenant and scope
   * filters are the point, not decoration.
   *
   * Returns null for an owner kind with no space of its own; the key builder
   * throws on null rather than falling back to a tenant-level root, so a new
   * owner kind fails loudly instead of writing bytes above the boundary.
   */
  const resolveOwnerSpaceId: ResolveOwnerSpaceId = async (auth, owner) => {
    if (owner.ownerType !== "project") {
      return null;
    }
    const { data, error } = await foreignSelect(
      getDb(auth),
      { scopeId: auth.scopeId, tenantId: auth.tenantId },
      {
        columns: "space_id",
        schema: "module_projects",
        table: "projects",
      }
    )
      .eq("id", owner.ownerId)
      .maybeSingle();
    if (error) {
      return null;
    }
    const spaceId = (data as { space_id?: unknown } | null)?.space_id;
    return typeof spaceId === "string" && spaceId.trim() ? spaceId : null;
  };

  registerFileManagerRoutes(server, source, resolveOwnerSpaceId);
  // Recent + pinned: the Work sidebar's Files section. Native rows only —
  // a connector mount's recents would be a provider walk, not a query.
  registerFileShortcutsRoutes(server, createFileShortcutsStore(getDb));
  registerFileSourcesRoutes(server, {
    client: connectionsClient,
    getDb,
    mounts,
  });

  // The space's own files, as operations and then as a Data-tree root. The
  // operations are what the adapter reaches the module through — an HTTP route
  // is not invocable from `invokeOperation`, so without them `Files/` could not
  // exist. Registering the adapter grants nothing on its own: the root appears
  // only where the space has mounted `files` (mount = grant).
  registerSpaceFileOperations(server, source);
  server.registerSpaceDataAdapter?.(createFilesSpaceDataAdapter());
};

export default registerFilesPlugin;
