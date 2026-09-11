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

/**
 * Every file space's bytes sit under its space's prefix — PLAN-spaces.md §1b:
 * "one prefix per space covers everything", which is what makes space export,
 * space delete and per-space mirroring single operations.
 *
 *   space owner   → `tenants/<t>/spaces/<s>/files/<entry>`
 *   other owners  → `tenants/<t>/spaces/<s>/files/<ownerType>/<ownerId>/<entry>`
 *
 * The second shape is the pre-space tail (`files/spaces/<type>/<id>/<entry>`)
 * moved below the space root, so the two layouts read as the same thing in a
 * bucket listing.
 *
 * This key is computed ONCE, at upload, and stored on the entry row; reads use
 * the stored value. Changing the layout therefore affects new uploads only —
 * files written under the old root keep resolving from their stored key. There
 * is no migration, and there does not need to be one.
 *
 * `ctx.spaceId` is REQUIRED for a non-space owner and deliberately has no
 * fallback: a default here would silently re-open the tenant-level root that
 * Phase 6 closed, and the bytes would be wrong in a way nothing surfaces until
 * someone exports a space and finds them missing. The caller resolves it
 * server-side (never from the request) — see the files module's `spaceContext`.
 */
function defaultBuildStorageKey(
  ctx: FileSourceContext,
  entryId: string
): string {
  if (ctx.owner.type === "space") {
    return `tenants/${ctx.tenantId}/spaces/${ctx.owner.id}/files/${entryId}`;
  }
  if (!ctx.spaceId) {
    throw new Error(
      `file_space_missing_space_id:${ctx.owner.type}:${ctx.owner.id}`
    );
  }
  return `tenants/${ctx.tenantId}/spaces/${ctx.spaceId}/files/${ctx.owner.type}/${ctx.owner.id}/${entryId}`;
}

function toFolderNode(row: FileFolderRow): FileSourceFolder {
  // Mount roots (connector-backed folders) surface their source kind and
  // connection so the UI can badge them; plain rows stay native.
  const source = (row.source ?? "native") as FileSourceFolder["source"];
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    source,
    ...(row.connectionId ? { connectionId: row.connectionId } : {}),
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

/** Thrown when a mutation targets a read-only (connector-mounted) node. */
export class FileSourceReadOnlyError extends Error {
  constructor(message = "Connected sources are read-only") {
    super(message);
    this.name = "FileSourceReadOnlyError";
  }
}

/**
 * Thrown when a save carries a token older than the file's current one — the
 * file moved under the editor. Surfaced as 409 so the writer can SEE the other
 * edit rather than have theirs win by arriving second.
 */
export class FileSourceConflictError extends Error {
  /** The row's current token, so the client can offer to reload. */
  readonly currentUpdatedAt: string;

  constructor(
    currentUpdatedAt: string,
    message = "This file changed since it was opened"
  ) {
    super(message);
    this.currentUpdatedAt = currentUpdatedAt;
    this.name = "FileSourceConflictError";
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

    async replaceContent(ctx, fileId, input) {
      const entry = await requireEntry(ctx, fileId);
      // A pending entry is an upload still in flight — it has no content to
      // replace, and writing to its key would race the upload it belongs to.
      if (entry.status !== "active") {
        throw new FileSourceNotFoundError("File not found");
      }
      if (entry.updatedAt !== input.expectedUpdatedAt) {
        throw new FileSourceConflictError(entry.updatedAt);
      }

      // Bytes first, row second, and deliberately in that order. The two stores
      // cannot be written atomically, so one of them has to be able to fail
      // second: if the row update fails here the object is new while
      // `sizeBytes` is stale, the caller gets an error, and — because
      // `updatedAt` did not move either — retrying the same save succeeds and
      // repairs the row. Row-first would report the new size for content that
      // never landed, which nothing later can detect.
      await blobs.upload(entry.storageKey, input.data, {
        contentType: entry.mimeType,
      });
      const updated = await entries.update(ctx, fileId, {
        sizeBytes: input.data.byteLength,
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

    async readBytes(ctx, fileId) {
      const entry = await requireEntry(ctx, fileId);
      const url = await blobs.getUrl(entry.storageKey, {
        signed: true,
        expiresIn: signedUrlExpiresIn,
      });
      let response: Response;
      try {
        response = await fetch(url);
      } catch {
        throw new FileSourceNotFoundError("File not found");
      }
      if (!response.ok) {
        throw new FileSourceNotFoundError("File not found");
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
