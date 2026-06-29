/**
 * File storage — Provider-agnostic file/object storage.
 *
 * @see docs/dev/backend-abstraction.md
 */

/* ── Upload / URL options ── */

export interface FileStorageUploadOptions {
  contentType?: string;
  /** Arbitrary metadata stored alongside the file record */
  metadata?: Record<string, unknown>;
  /** Module that owns this file (e.g. "expenses", "company-profile") */
  module?: string;
  upsert?: boolean;
}

export interface FileStorageUrlOptions {
  expiresIn?: number;
  signed?: boolean;
}

export interface FileStorageSignedUploadOptions {
  contentType?: string;
  expiresIn?: number;
  maxSize?: number;
}

export interface FileStorageSignedUploadResult {
  headers?: Record<string, string>;
  key: string;
  url: string;
}

export interface FileStorageListOptions {
  limit?: number;
  offset?: number;
  /** Only return files matching this prefix after the base prefix */
  search?: string;
  /** Sort field */
  sortBy?: "name" | "created_at" | "size_bytes";
  sortOrder?: "asc" | "desc";
}

/* ── File metadata ── */

export interface FileStorageFile {
  /** ISO timestamp */
  created_at: string;
  /** Original filename */
  filename: string;
  /** Inbox message UUID when key matches tenants/.../inbox/(uuid)/ (set by HTTP list API) */
  inbox_message_id?: string;
  /** Storage key (full path in bucket) */
  key: string;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
  /** MIME type */
  mime_type: string;
  /** Owning module (e.g. "expenses") */
  module?: string;
  /** Size in bytes */
  size_bytes: number;
  /** ISO timestamp */
  updated_at: string;
}

export interface FileStorageListResult {
  files: FileStorageFile[];
  total: number;
}

/** One subfolder at a single listing level. */
export interface FileStorageFolder {
  /** Folder display name (leaf segment). */
  name: string;
  /** Absolute storage prefix of the folder, ending with `/`. */
  prefix: string;
}

/** Single-level (folder-aware) listing result. */
export interface FileStorageChildrenResult {
  files: FileStorageFile[];
  folders: FileStorageFolder[];
}

/* ── Provider contract ── */

/**
 * Low-level storage provider. Handles raw byte operations against
 * a specific backend (Supabase, S3, local filesystem, etc.).
 *
 * Providers are stateless — they do not track metadata.
 * The FileStorageService layer adds metadata tracking on top.
 */
export interface FileStorageProvider {
  /** Copy a file within the same provider */
  copy(src: string, dest: string): Promise<void>;

  /** Delete a file from storage */
  delete(key: string): Promise<void>;

  /** Download bytes; returns null if not found */
  download(key: string): Promise<Uint8Array | null>;

  /** Check if a file exists */
  exists(key: string): Promise<boolean>;

  /** Get a URL (public or signed) for a stored file */
  getUrl(
    key: string,
    options?: { signed?: boolean; expiresIn?: number }
  ): Promise<string>;
  /** Provider identifier, e.g. "supabase", "s3", "local" */
  readonly id: string;

  /** List files under a prefix */
  list(
    prefix: string,
    options?: { limit?: number; offset?: number; search?: string }
  ): Promise<{
    files: Array<{
      name: string;
      metadata?: Record<string, unknown>;
      created_at?: string;
      updated_at?: string;
    }>;
    total: number;
  }>;

  /**
   * Single-level listing: immediate files and subfolders at `prefix`
   * (no recursion). Optional — providers that cannot list folders omit it.
   */
  listChildren?(
    prefix: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{
    folders: Array<{ name: string }>;
    files: Array<{
      name: string;
      metadata?: Record<string, unknown>;
      created_at?: string;
      updated_at?: string;
    }>;
  }>;
  /** Human-readable name */
  readonly name: string;

  /** Mint a browser-direct upload URL when supported by the provider */
  signedUploadUrl?(
    key: string,
    options?: FileStorageSignedUploadOptions
  ): Promise<FileStorageSignedUploadResult>;

  /** Upload bytes to storage */
  upload(
    key: string,
    data: Blob | ArrayBuffer | Uint8Array,
    options?: { contentType?: string; upsert?: boolean }
  ): Promise<void>;
}

/* ── FileStorageService contract ── */

/**
 * High-level storage service used by modules and the admin UI.
 * Wraps a FileStorageProvider and adds metadata tracking, path scoping,
 * and tenant isolation.
 */
export interface FileStorageService {
  /** Copy a file and create a new metadata record */
  copy(src: string, dest: string): Promise<FileStorageFile>;

  /** Delete a file and its metadata */
  delete(key: string): Promise<void>;

  /** Download raw bytes */
  download(key: string): Promise<Uint8Array | null>;

  /** Check if a file exists */
  exists(key: string): Promise<boolean>;

  /** Get file metadata without downloading */
  getFile(key: string): Promise<FileStorageFile | null>;

  /** Get a URL for a file (signed by default for private buckets) */
  getUrl(key: string, options?: FileStorageUrlOptions): Promise<string>;

  /** List files with filtering and pagination */
  list(
    prefix: string,
    options?: FileStorageListOptions
  ): Promise<FileStorageListResult>;

  /**
   * Single-level listing of immediate files + subfolders at `prefix`
   * (folder-aware, no recursion). Optional — present when the provider
   * supports native folder listing.
   */
  listChildren?(
    prefix: string,
    options?: { limit?: number; offset?: number }
  ): Promise<FileStorageChildrenResult>;
  /** Mint a browser-direct upload URL when supported by the provider */
  signedUploadUrl?(
    key: string,
    options?: FileStorageSignedUploadOptions
  ): Promise<FileStorageSignedUploadResult>;

  /** Upload a file and track its metadata */
  upload(
    key: string,
    data: Blob | ArrayBuffer | Uint8Array,
    options?: FileStorageUploadOptions
  ): Promise<FileStorageFile>;
}
