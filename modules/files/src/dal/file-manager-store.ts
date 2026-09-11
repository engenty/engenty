/**
 * Supabase implementations of the native file-source persistence ports
 * (`NativeFolderStore`, `NativeEntryStore`) from `@engenty/file-storage`.
 *
 * Every query is scoped by (tenant_id, owner_type, owner_id) so a file space
 * can never leak across tenants or owners.
 */

import type {
  FileEntryRow,
  FileFolderRow,
  FileSourceContext,
  NativeEntryCreateInput,
  NativeEntryPatch,
  NativeEntryStore,
  NativeFolderCreateInput,
  NativeFolderPatch,
  NativeFolderStore,
} from "@engenty/file-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

const SCHEMA = "module_files";

const FOLDER_COLUMNS =
  "id, parent_id, name, source, source_folder_id, connection_id, created_at, updated_at";

interface FolderDbRow {
  connection_id: string | null;
  created_at: string;
  id: string;
  name: string;
  parent_id: string | null;
  source: string;
  source_folder_id: string | null;
  updated_at: string;
}

interface EntryDbRow {
  created_at: string;
  filename: string;
  folder_id: string | null;
  id: string;
  mime_type: string;
  size_bytes: number;
  status: "pending" | "active";
  storage_key: string;
  updated_at: string;
}

function toFolderRow(row: FolderDbRow): FileFolderRow {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    source: row.source,
    sourceFolderId: row.source_folder_id,
    connectionId: row.connection_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEntryRow(row: EntryDbRow): FileEntryRow {
  return {
    id: row.id,
    folderId: row.folder_id,
    storageKey: row.storage_key,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes ?? 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createFileManagerStores(
  /** Tenant-locked handle factory (engenty_server lane, RLS-enforced) — every
   * store method carries a FileSourceContext, so each query resolves the
   * calling tenant's own handle. */
  getDb: (auth: { tenantId: string }) => SupabaseClient
): {
  entries: NativeEntryStore;
  folders: NativeFolderStore;
} {
  const foldersTable = (ctx: FileSourceContext) =>
    getDb({ tenantId: ctx.tenantId }).schema(SCHEMA).from("file_folders");
  const entriesTable = (ctx: FileSourceContext) =>
    getDb({ tenantId: ctx.tenantId }).schema(SCHEMA).from("file_entries");

  const scope = (ctx: FileSourceContext) => ({
    tenant_id: ctx.tenantId,
    owner_type: ctx.owner.type,
    owner_id: ctx.owner.id,
  });

  const folders: NativeFolderStore = {
    async list(ctx, parentId) {
      let query = foldersTable(ctx)
        .select(FOLDER_COLUMNS)
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .order("name", { ascending: true });
      query = parentId
        ? query.eq("parent_id", parentId)
        : query.is("parent_id", null);
      const { data, error } = await query;
      if (error) {
        throw new Error(`file_folders.list failed: ${error.message}`);
      }
      return (data as FolderDbRow[]).map(toFolderRow);
    },

    async get(ctx, id) {
      const { data, error } = await foldersTable(ctx)
        .select(FOLDER_COLUMNS)
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        throw new Error(`file_folders.get failed: ${error.message}`);
      }
      return data ? toFolderRow(data as FolderDbRow) : null;
    },

    async create(ctx, input: NativeFolderCreateInput) {
      const { data, error } = await foldersTable(ctx)
        .insert({
          ...scope(ctx),
          parent_id: input.parentId,
          name: input.name,
          source: "native",
        })
        .select(FOLDER_COLUMNS)
        .single();
      if (error) {
        throw new Error(`file_folders.create failed: ${error.message}`);
      }
      return toFolderRow(data as FolderDbRow);
    },

    async update(ctx, id, patch: NativeFolderPatch) {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (patch.name !== undefined) {
        updates.name = patch.name;
      }
      if (patch.parentId !== undefined) {
        updates.parent_id = patch.parentId;
      }
      const { data, error } = await foldersTable(ctx)
        .update(updates)
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("id", id)
        .select(FOLDER_COLUMNS)
        .maybeSingle();
      if (error) {
        throw new Error(`file_folders.update failed: ${error.message}`);
      }
      return data ? toFolderRow(data as FolderDbRow) : null;
    },

    async delete(ctx, id) {
      const { error } = await foldersTable(ctx)
        .delete()
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("id", id);
      if (error) {
        throw new Error(`file_folders.delete failed: ${error.message}`);
      }
    },

    async listDescendantStorageKeys(ctx, id) {
      // Walk the folder subtree in code (folder trees are shallow) and collect
      // active entry storage keys so blobs can be cleaned up before the
      // cascading row delete.
      const folderIds: string[] = [id];
      let frontier: string[] = [id];
      while (frontier.length > 0) {
        const { data, error } = await foldersTable(ctx)
          .select("id")
          .eq("tenant_id", ctx.tenantId)
          .eq("owner_type", ctx.owner.type)
          .eq("owner_id", ctx.owner.id)
          .in("parent_id", frontier);
        if (error) {
          throw new Error(
            `file_folders.listDescendants failed: ${error.message}`
          );
        }
        const next = (data as { id: string }[]).map((r) => r.id);
        folderIds.push(...next);
        frontier = next;
      }
      const { data, error } = await entriesTable(ctx)
        .select("storage_key")
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .in("folder_id", folderIds);
      if (error) {
        throw new Error(`file_entries.listKeys failed: ${error.message}`);
      }
      return (data as { storage_key: string }[])
        .map((r) => r.storage_key)
        .filter((key) => key.length > 0);
    },
  };

  const entries: NativeEntryStore = {
    async list(ctx, folderId) {
      let query = entriesTable(ctx)
        .select(
          "id, folder_id, storage_key, filename, mime_type, size_bytes, status, created_at, updated_at"
        )
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .order("filename", { ascending: true });
      query = folderId
        ? query.eq("folder_id", folderId)
        : query.is("folder_id", null);
      const { data, error } = await query;
      if (error) {
        throw new Error(`file_entries.list failed: ${error.message}`);
      }
      return (data as EntryDbRow[]).map(toEntryRow);
    },

    async get(ctx, id) {
      const { data, error } = await entriesTable(ctx)
        .select(
          "id, folder_id, storage_key, filename, mime_type, size_bytes, status, created_at, updated_at"
        )
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        throw new Error(`file_entries.get failed: ${error.message}`);
      }
      return data ? toEntryRow(data as EntryDbRow) : null;
    },

    async createPending(ctx, input: NativeEntryCreateInput) {
      const { data, error } = await entriesTable(ctx)
        .insert({
          ...scope(ctx),
          folder_id: input.folderId,
          storage_key: input.storageKey,
          filename: input.filename,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
          status: "pending",
          source: "native",
        })
        .select(
          "id, folder_id, storage_key, filename, mime_type, size_bytes, status, created_at, updated_at"
        )
        .single();
      if (error) {
        throw new Error(`file_entries.createPending failed: ${error.message}`);
      }
      return toEntryRow(data as EntryDbRow);
    },

    async update(ctx, id, patch: NativeEntryPatch) {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (patch.filename !== undefined) {
        updates.filename = patch.filename;
      }
      if (patch.folderId !== undefined) {
        updates.folder_id = patch.folderId;
      }
      if (patch.mimeType !== undefined) {
        updates.mime_type = patch.mimeType;
      }
      if (patch.sizeBytes !== undefined) {
        updates.size_bytes = patch.sizeBytes;
      }
      if (patch.status !== undefined) {
        updates.status = patch.status;
      }
      if (patch.storageKey !== undefined) {
        updates.storage_key = patch.storageKey;
      }
      const { data, error } = await entriesTable(ctx)
        .update(updates)
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("id", id)
        .select(
          "id, folder_id, storage_key, filename, mime_type, size_bytes, status, created_at, updated_at"
        )
        .maybeSingle();
      if (error) {
        throw new Error(`file_entries.update failed: ${error.message}`);
      }
      return data ? toEntryRow(data as EntryDbRow) : null;
    },

    async delete(ctx, id) {
      const { error } = await entriesTable(ctx)
        .delete()
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("id", id);
      if (error) {
        throw new Error(`file_entries.delete failed: ${error.message}`);
      }
    },
  };

  return { folders, entries };
}

/* ── Connector mounts ──
 * A mount is a `file_folders` row whose source is a connector kind, carrying
 * the backing connection id and the provider folder ref. Everything below the
 * mount is virtual (`cnx:` ids) — no rows.
 */

export interface MountDbInput {
  connectionId: string;
  name: string;
  parentId: string | null;
  source: string;
  sourceFolderId: string | null;
}

export interface FileMountStore {
  create(ctx: FileSourceContext, input: MountDbInput): Promise<FileFolderRow>;
  /**
   * The mount this owner already has for a connection, if any
   * (PLAN-connections-ux.md B3b).
   *
   * Placing the same account twice must produce one folder, not two: binding
   * runs again whenever either side is re-added, and a second root mount for
   * the same drive is a duplicate tree nobody asked for.
   */
  findByConnection(
    ctx: FileSourceContext,
    connectionId: string
  ): Promise<FileFolderRow | null>;
  get(ctx: FileSourceContext, folderId: string): Promise<FileFolderRow | null>;
}

export function createFileMountStore(
  /** Tenant-locked handle factory — mounts resolve on the caller's tenant. */
  getDb: (auth: { tenantId: string }) => SupabaseClient
): FileMountStore {
  const foldersTable = (ctx: FileSourceContext) =>
    getDb({ tenantId: ctx.tenantId }).schema(SCHEMA).from("file_folders");

  return {
    async get(ctx, folderId) {
      const { data, error } = await foldersTable(ctx)
        .select(FOLDER_COLUMNS)
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("id", folderId)
        .neq("source", "native")
        .not("connection_id", "is", null)
        .maybeSingle();
      if (error) {
        throw new Error(`file_folders.getMount failed: ${error.message}`);
      }
      return data ? toFolderRow(data as FolderDbRow) : null;
    },

    async findByConnection(ctx, connectionId) {
      const { data, error } = await foldersTable(ctx)
        .select(FOLDER_COLUMNS)
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("connection_id", connectionId)
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(`file_folders.findMount failed: ${error.message}`);
      }
      return data ? toFolderRow(data as FolderDbRow) : null;
    },

    async create(ctx, input) {
      const { data, error } = await foldersTable(ctx)
        .insert({
          tenant_id: ctx.tenantId,
          owner_type: ctx.owner.type,
          owner_id: ctx.owner.id,
          parent_id: input.parentId,
          name: input.name,
          source: input.source,
          source_folder_id: input.sourceFolderId,
          connection_id: input.connectionId,
        })
        .select(FOLDER_COLUMNS)
        .single();
      if (error) {
        throw new Error(`file_folders.createMount failed: ${error.message}`);
      }
      return toFolderRow(data as FolderDbRow);
    },
  };
}
