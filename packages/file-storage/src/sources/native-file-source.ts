/**
 * Native file source — direct uploads into our own storage with DB-backed
 * folders. Implements {@link FileSource} over injected persistence ports
 * ({@link NativeFolderStore}, {@link NativeEntryStore}) and a blob store, so
 * the file-storage package stays free of any database dependency.
 *
 * Design note: blobs are written under a *stable, opaque* key derived from the
 * entry id — never the filename. Rename and move are therefore pure metadata
 * updates and never copy bytes.
 */

import type {
  FileEntryRow,
  FileFolderRow,
  FileSource,
  FileSourceContext,
  FileSourceFile,
  FileSourceFolder,
  FileSourceListing,
  FileSourceListOptions,
  FileSourceUploadInput,
  FileSourceUploadTicket,
  NativeBlobStore,
  NativeEntryStore,
  NativeFolderStore,
} from "../file-source-types.js";

export interface CreateNativeFileSourceOptions {
  blobs: NativeBlobStore;
  /**
   * Builds the opaque, tenant-scoped blob key for an entry. Defaults to
   * `tenants/<tenantId>/files/spaces/<ownerType>/<ownerId>/<entryId>`.
   */
  buildStorageKey?: (ctx: FileSourceContext, entryId: string) => string;
  entries: NativeEntryStore;
  folders: NativeFolderStore;
  /** Signed download URL lifetime in seconds (default 3600). */
  signedUrlExpiresIn?: number;
}

function defaultBuildStorageKey(
  ctx: FileSourceContext,
  entryId: string
): string {
  return `tenants/${ctx.tenantId}/files/spaces/${ctx.owner.type}/${ctx.owner.id}/${entryId}`;
}

function toFolderNode(row: FileFolderRow): FileSourceFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    source: "native",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toFileNode(row: FileEntryRow): FileSourceFile {
  return {
    id: row.id,
    name: row.filename,
    folderId: row.folderId,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    source: "native",
    storageKey: row.storageKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class FileSourceNotFoundError extends Error {
  constructor(message = "File or folder not found") {
    super(message);
    this.name = "FileSourceNotFoundError";
  }
}

export function createNativeFileSource(
  options: CreateNativeFileSourceOptions
): FileSource {
  const { folders, entries, blobs } = options;
  const buildStorageKey = options.buildStorageKey ?? defaultBuildStorageKey;
  const signedUrlExpiresIn = options.signedUrlExpiresIn ?? 3600;

  async function requireFolder(
    ctx: FileSourceContext,
    id: string
  ): Promise<FileFolderRow> {
    const folder = await folders.get(ctx, id);
    if (!folder) {
      throw new FileSourceNotFoundError("Folder not found");
    }
    return folder;
  }

  async function requireEntry(
    ctx: FileSourceContext,
    id: string
  ): Promise<FileEntryRow> {
    const entry = await entries.get(ctx, id);
    if (!entry) {
      throw new FileSourceNotFoundError("File not found");
    }
    return entry;
  }

  return {
    kind: "native",

    async listFolder(
      ctx: FileSourceContext,
      folderId: string | null,
      listOptions?: FileSourceListOptions
    ): Promise<FileSourceListing> {
      const [folderRows, entryRows] = await Promise.all([
        folders.list(ctx, folderId),
        entries.list(ctx, folderId),
      ]);
      const search = listOptions?.search?.trim().toLowerCase();
      const matches = (name: string) =>
        !search || name.toLowerCase().includes(search);
      return {
        folders: folderRows.filter((f) => matches(f.name)).map(toFolderNode),
        // Pending entries are uploads in flight — hide until finalized.
        files: entryRows
          .filter((e) => e.status === "active" && matches(e.filename))
          .map(toFileNode),
      };
    },

    async createFolder(ctx, parentId, name) {
      if (parentId) {
        await requireFolder(ctx, parentId);
      }
      const row = await folders.create(ctx, { parentId, name: name.trim() });
      return toFolderNode(row);
    },

    async renameFolder(ctx, folderId, name) {
      const updated = await folders.update(ctx, folderId, {
        name: name.trim(),
      });
      if (!updated) {
        throw new FileSourceNotFoundError("Folder not found");
      }
      return toFolderNode(updated);
    },

    async moveFolder(ctx, folderId, newParentId) {
      if (newParentId === folderId) {
        throw new Error("A folder cannot be moved into itself");
      }
      if (newParentId) {
        await requireFolder(ctx, newParentId);
      }
      const updated = await folders.update(ctx, folderId, {
        parentId: newParentId,
      });
      if (!updated) {
        throw new FileSourceNotFoundError("Folder not found");
      }
      return toFolderNode(updated);
    },

    async deleteFolder(ctx, folderId) {
      await requireFolder(ctx, folderId);
      const keys = await folders.listDescendantStorageKeys(ctx, folderId);
      // Best-effort blob cleanup before the cascading row delete.
      await Promise.all(
        keys.map((key) => blobs.delete(key).catch(() => undefined))
      );
      await folders.delete(ctx, folderId);
    },

    async beginUpload(
      ctx: FileSourceContext,
      input: FileSourceUploadInput
    ): Promise<FileSourceUploadTicket> {
      if (input.folderId) {
        await requireFolder(ctx, input.folderId);
      }
      // Create the pending row first so the opaque key can embed its id, then
      // persist the resolved key back. Rename/move never touch this key again.
      const placeholder = await entries.createPending(ctx, {
        folderId: input.folderId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: "",
      });
      const storageKey = buildStorageKey(ctx, placeholder.id);
      await entries.update(ctx, placeholder.id, { storageKey });
      return { entryId: placeholder.id, storageKey };
    },

    async finalizeUpload(ctx, entryId) {
      const entry = await requireEntry(ctx, entryId);
      const updated = await entries.update(ctx, entryId, { status: "active" });
      return toFileNode(updated ?? entry);
    },

    async renameFile(ctx, fileId, name) {
      const updated = await entries.update(ctx, fileId, {
        filename: name.trim(),
      });
      if (!updated) {
        throw new FileSourceNotFoundError("File not found");
      }
      return toFileNode(updated);
    },

    async moveFile(ctx, fileId, newFolderId) {
      if (newFolderId) {
        await requireFolder(ctx, newFolderId);
      }
      const updated = await entries.update(ctx, fileId, {
        folderId: newFolderId,
      });
      if (!updated) {
        throw new FileSourceNotFoundError("File not found");
      }
      return toFileNode(updated);
    },

    async deleteFile(ctx, fileId) {
      const entry = await requireEntry(ctx, fileId);
      if (entry.storageKey) {
        await blobs.delete(entry.storageKey).catch(() => undefined);
      }
      await entries.delete(ctx, fileId);
    },

    async getDownloadUrl(ctx, fileId) {
      const entry = await requireEntry(ctx, fileId);
      return blobs.getUrl(entry.storageKey, {
        signed: true,
        expiresIn: signedUrlExpiresIn,
      });
    },
  };
}
