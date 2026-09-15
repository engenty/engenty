/**
 * The two reads the Work sidebar's Files section needs and the file manager's
 * folder-by-folder listing cannot answer: the newest files of a file space
 * across every folder, and the files THIS person pinned there. Pins live in
 * `module_files.file_pins`; recents are a sort over `file_entries`.
 *
 * Same scope as every files query — (tenant_id, owner_type, owner_id) — so a
 * pin or a recent list never crosses a file space.
 */

import type { FileEntryRow, FileSourceContext } from "@engenty/file-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

const SCHEMA = "module_files";
const ENTRY_COLUMNS =
  "id, folder_id, storage_key, filename, mime_type, size_bytes, status, created_at, updated_at";

/** The sidebar shows a handful; the cap keeps a stray `limit` honest. */
export const RECENT_FILES_MAX = 20;

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

function toEntryRow(row: EntryDbRow): FileEntryRow {
  return {
    createdAt: row.created_at,
    filename: row.filename,
    folderId: row.folder_id,
    id: row.id,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes ?? 0),
    status: row.status,
    storageKey: row.storage_key,
    updatedAt: row.updated_at,
  };
}

export interface FileShortcutsStore {
  /** Files the principal pinned in this file space, oldest pin first. */
  listPinned(ctx: FileSourceContext): Promise<FileEntryRow[]>;
  /** Active files of this file space, newest `updated_at` first. */
  listRecent(ctx: FileSourceContext, limit: number): Promise<FileEntryRow[]>;
  pin(ctx: FileSourceContext, fileId: string): Promise<void>;
  unpin(ctx: FileSourceContext, fileId: string): Promise<void>;
}

function requirePrincipal(ctx: FileSourceContext): string {
  const principalId = ctx.principalId?.trim();
  if (!principalId) {
    throw new Error("file pins need a signed-in principal");
  }
  return principalId;
}

export function createFileShortcutsStore(
  getDb: (auth: { tenantId: string }) => SupabaseClient
): FileShortcutsStore {
  const table = (ctx: FileSourceContext, name: string) =>
    getDb({ tenantId: ctx.tenantId }).schema(SCHEMA).from(name);
  const scope = (ctx: FileSourceContext) => ({
    owner_id: ctx.owner.id,
    owner_type: ctx.owner.type,
    tenant_id: ctx.tenantId,
  });

  return {
    async listRecent(ctx, limit) {
      const { data, error } = await table(ctx, "file_entries")
        .select(ENTRY_COLUMNS)
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(Math.max(1, Math.min(limit, RECENT_FILES_MAX)));
      if (error) {
        throw new Error(`file_entries.listRecent failed: ${error.message}`);
      }
      return (data as EntryDbRow[]).map(toEntryRow);
    },

    async listPinned(ctx) {
      const principalId = requirePrincipal(ctx);
      const { data, error } = await table(ctx, "file_pins")
        .select("file_id, created_at")
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("principal_id", principalId)
        .order("created_at", { ascending: true });
      if (error) {
        throw new Error(`file_pins.list failed: ${error.message}`);
      }
      const ids = (data as { file_id: string }[]).map((row) => row.file_id);
      if (ids.length === 0) {
        return [];
      }
      const entries = await table(ctx, "file_entries")
        .select(ENTRY_COLUMNS)
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("status", "active")
        .in("id", ids);
      if (entries.error) {
        throw new Error(`file_pins.entries failed: ${entries.error.message}`);
      }
      const byId = new Map(
        (entries.data as EntryDbRow[]).map((row) => [row.id, toEntryRow(row)])
      );
      // Pin order, not filename order: the person arranged this list.
      return ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      });
    },

    async pin(ctx, fileId) {
      const principalId = requirePrincipal(ctx);
      const { error } = await table(ctx, "file_pins").upsert(
        { ...scope(ctx), file_id: fileId, principal_id: principalId },
        {
          ignoreDuplicates: true,
          onConflict: "tenant_id,owner_type,owner_id,principal_id,file_id",
        }
      );
      if (error) {
        throw new Error(`file_pins.pin failed: ${error.message}`);
      }
    },

    async unpin(ctx, fileId) {
      const principalId = requirePrincipal(ctx);
      const { error } = await table(ctx, "file_pins")
        .delete()
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_type", ctx.owner.type)
        .eq("owner_id", ctx.owner.id)
        .eq("principal_id", principalId)
        .eq("file_id", fileId);
      if (error) {
        throw new Error(`file_pins.unpin failed: ${error.message}`);
      }
    },
  };
}
