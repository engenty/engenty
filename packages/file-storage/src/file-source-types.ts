/**
 * File source — abstraction over *where* a file manager browses and manages
 * files, independent of the blob backend.
 *
 * Two axes must not be conflated:
 *  - The blob backend (Supabase, S3, …) is abstracted by {@link FileStorageProvider}.
 *  - A *source* is the higher layer: `native` (files uploaded directly into our
 *    storage, with DB-backed folders) vs. external connectors (Google Drive,
 *    Dropbox, …) reached through `files-sdk`.
 *
 * Phase A ships only the native source. Connector sources implement the same
 * {@link FileSource} interface in Phase B without changing the HTTP/UI layers.
 *
 * @see docs/dev/backend-abstraction.md
 */

export type FileSourceKind =
  | "native"
  | "gdrive"
  | "dropbox"
  | "onedrive"
  | "s3"
  | "local";

/** A folder node in a file space (source-agnostic). */
export interface FileSourceFolder {
  /**
   * Connections-module connection id backing this folder (mount roots only).
   * Presence marks the folder as a mounted external source.
   */
  connectionId?: string;
  /** ISO timestamp */
  createdAt: string;
  id: string;
  name: string;
  /** null = space root */
  parentId: string | null;
  /** True for virtual nodes inside a mount: browse/download only. */
  readOnly?: boolean;
  source: FileSourceKind;
  /** ISO timestamp */
  updatedAt: string;
}

/** A file node in a file space (source-agnostic). */
export interface FileSourceFile {
  /** ISO timestamp */
  createdAt: string;
  /** null = space root */
  folderId: string | null;
  id: string;
  mimeType: string;
  name: string;
  /** True for virtual nodes inside a mount: browse/download only. */
  readOnly?: boolean;
  sizeBytes: number;
  source: FileSourceKind;
  /** External provider file id (connector sources only). */
  sourceFileId?: string;
  /** Native blob key (native source only). */
  storageKey?: string;
  /** ISO timestamp */
  updatedAt: string;
}

export interface FileSourceListing {
  /** Opaque pagination cursor for sources that page (connectors). */
  cursor?: string;
  files: FileSourceFile[];
  folders: FileSourceFolder[];
  /** True when the listed level lives inside a read-only mount. */
  readOnly?: boolean;
}

/** Identifies the owning container a file space is bound to (e.g. a project). */
export interface FileSpaceOwner {
  id: string;
  /** Owner kind, e.g. "project". */
  type: string;
}

/** Per-request context every {@link FileSource} operation runs under. */
export interface FileSourceContext {
  owner: FileSpaceOwner;
  principalId?: string;
  tenantId: string;
}

export interface FileSourceListOptions {
  cursor?: string;
  limit?: number;
  search?: string;
}

export interface FileSourceUploadInput {
  filename: string;
  /** null = space root */
  folderId: string | null;
  mimeType: string;
  sizeBytes: number;
}

/**
 * A registered native upload. The client mints a signed PUT URL for
 * {@link FileSourceUploadTicket.storageKey} (via the file-storage signed-upload
 * route), uploads the bytes, then calls finalize with {@link FileSourceUploadTicket.entryId}.
 */
export interface FileSourceUploadTicket {
  /** Pending entry id; pass to finalizeUpload after the PUT succeeds. */
  entryId: string;
  /** Tenant-scoped blob key the bytes must be written to. */
  storageKey: string;
}

/**
 * Source-agnostic file-manager operations. The HTTP layer dispatches through
 * this interface; native and connector implementations differ only in their
 * backing store.
 */
export interface FileSource {
  /** Register an upload and return where the client should PUT the bytes. */
  beginUpload(
    ctx: FileSourceContext,
    input: FileSourceUploadInput
  ): Promise<FileSourceUploadTicket>;

  createFolder(
    ctx: FileSourceContext,
    parentId: string | null,
    name: string
  ): Promise<FileSourceFolder>;

  deleteFile(ctx: FileSourceContext, fileId: string): Promise<void>;

  deleteFolder(ctx: FileSourceContext, folderId: string): Promise<void>;

  /** Confirm a registered upload, materializing the file node. */
  finalizeUpload(
    ctx: FileSourceContext,
    entryId: string
  ): Promise<FileSourceFile>;

  /** Signed, time-limited download URL for a file. */
  getDownloadUrl(ctx: FileSourceContext, fileId: string): Promise<string>;

  readonly kind: FileSourceKind;

  listFolder(
    ctx: FileSourceContext,
    folderId: string | null,
    options?: FileSourceListOptions
  ): Promise<FileSourceListing>;

  moveFile(
    ctx: FileSourceContext,
    fileId: string,
    newFolderId: string | null
  ): Promise<FileSourceFile>;

  moveFolder(
    ctx: FileSourceContext,
    folderId: string,
    newParentId: string | null
  ): Promise<FileSourceFolder>;

  renameFile(
    ctx: FileSourceContext,
    fileId: string,
    name: string
  ): Promise<FileSourceFile>;

  renameFolder(
    ctx: FileSourceContext,
    folderId: string,
    name: string
  ): Promise<FileSourceFolder>;
}

/* ── Native source dependency ports ──
 * The native source is backend-agnostic: it depends on these ports, whose
 * concrete (Supabase) implementations live in the files module. This keeps the
 * file-storage package free of any database dependency.
 */

export type FileEntryStatus = "pending" | "active";

/** Persisted folder row, scoped to (tenant, owner). */
export interface FileFolderRow {
  /** Connection id when this folder is a connector mount root. */
  connectionId?: string | null;
  createdAt: string;
  id: string;
  name: string;
  parentId: string | null;
  /** Source kind ("native" or a connector kind for mount roots). */
  source?: string;
  /** Provider folder ref the mount points at (null = provider root). */
  sourceFolderId?: string | null;
  updatedAt: string;
}

/** Persisted file entry row, scoped to (tenant, owner). */
export interface FileEntryRow {
  createdAt: string;
  filename: string;
  folderId: string | null;
  id: string;
  mimeType: string;
  sizeBytes: number;
  status: FileEntryStatus;
  storageKey: string;
  updatedAt: string;
}

export interface NativeFolderCreateInput {
  name: string;
  parentId: string | null;
}

export interface NativeFolderPatch {
  name?: string;
  parentId?: string | null;
}

export interface NativeEntryCreateInput {
  filename: string;
  folderId: string | null;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}

export interface NativeEntryPatch {
  filename?: string;
  folderId?: string | null;
  mimeType?: string;
  sizeBytes?: number;
  status?: FileEntryStatus;
  storageKey?: string;
}

/** Folder persistence port. All methods are scoped by `ctx` (tenant + owner). */
export interface NativeFolderStore {
  create(
    ctx: FileSourceContext,
    input: NativeFolderCreateInput
  ): Promise<FileFolderRow>;
  /** Delete a folder; descendant folders/entries cascade in the database. */
  delete(ctx: FileSourceContext, id: string): Promise<void>;
  get(ctx: FileSourceContext, id: string): Promise<FileFolderRow | null>;
  list(
    ctx: FileSourceContext,
    parentId: string | null
  ): Promise<FileFolderRow[]>;
  /** Storage keys of every active entry at or below `id` (for blob cleanup). */
  listDescendantStorageKeys(
    ctx: FileSourceContext,
    id: string
  ): Promise<string[]>;
  update(
    ctx: FileSourceContext,
    id: string,
    patch: NativeFolderPatch
  ): Promise<FileFolderRow | null>;
}

/** Entry persistence port. All methods are scoped by `ctx` (tenant + owner). */
export interface NativeEntryStore {
  createPending(
    ctx: FileSourceContext,
    input: NativeEntryCreateInput
  ): Promise<FileEntryRow>;
  delete(ctx: FileSourceContext, id: string): Promise<void>;
  get(ctx: FileSourceContext, id: string): Promise<FileEntryRow | null>;
  list(
    ctx: FileSourceContext,
    folderId: string | null
  ): Promise<FileEntryRow[]>;
  update(
    ctx: FileSourceContext,
    id: string,
    patch: NativeEntryPatch
  ): Promise<FileEntryRow | null>;
}

/** Minimal blob operations the native source needs from a storage service. */
export interface NativeBlobStore {
  delete(key: string): Promise<void>;
  exists?(key: string): Promise<boolean>;
  getUrl(
    key: string,
    options?: { expiresIn?: number; signed?: boolean }
  ): Promise<string>;
}
