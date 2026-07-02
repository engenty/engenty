import { requestApiJson } from "@engenty/api-client";
import { guessFileStorageMimeFromFilename } from "@engenty/file-storage";

export {
  isFileStorageOfficePdfPreviewMime,
  isFileStorageThumbnailSourceMime,
} from "@engenty/file-storage";

export interface FilesFileInfo {
  created_at: string;
  filename: string;
  inbox_message_id?: string;
  key: string;
  metadata?: Record<string, unknown>;
  mime_type: string;
  module?: string;
  /** Short folder hint, e.g. knowledge › my-kb */
  path_label?: string;
  /** Storage key with the tenant root stripped (for display). */
  rel_key?: string;
  size_bytes: number;
  updated_at: string;
}

const BASE = "/api/file-storage/files";

export interface FilesBucketInfo {
  default: boolean;
  id: string;
}

export async function listFilesBuckets(
  signal?: AbortSignal
): Promise<FilesBucketInfo[]> {
  return requestApiJson<FilesBucketInfo[]>("/api/file-storage/buckets", {
    method: "GET",
    signal,
  });
}

export async function listFiles(
  opts?: {
    bucket?: string;
    prefix?: string;
    limit?: number;
    offset?: number;
    search?: string;
  },
  signal?: AbortSignal
): Promise<FilesFileInfo[]> {
  const params = new URLSearchParams();
  if (opts?.bucket) {
    params.set("bucket", opts.bucket);
  }
  if (opts?.prefix) {
    params.set("prefix", opts.prefix);
  }
  if (opts?.limit) {
    params.set("limit", String(opts.limit));
  }
  if (opts?.offset) {
    params.set("offset", String(opts.offset));
  }
  if (opts?.search) {
    params.set("search", opts.search);
  }
  const qs = params.toString();
  const url = qs ? `${BASE}?${qs}` : BASE;
  return requestApiJson<FilesFileInfo[]>(url, { method: "GET", signal });
}

/** One folder under the current prefix (relative to the tenant root). */
export interface FilesFolderInfo {
  name: string;
  /** Tenant-relative prefix to navigate into, ending with `/`. */
  prefix: string;
}

export interface FilesChildren {
  files: FilesFileInfo[];
  folders: FilesFolderInfo[];
}

/** Single-level (folder-aware) listing for the explorer at a tenant prefix. */
export async function listFilesChildren(
  opts: { bucket: string; prefix?: string },
  signal?: AbortSignal
): Promise<FilesChildren> {
  const params = new URLSearchParams({ mode: "children", bucket: opts.bucket });
  if (opts.prefix) {
    params.set("prefix", opts.prefix);
  }
  return requestApiJson<FilesChildren>(`${BASE}?${params}`, {
    method: "GET",
    signal,
  });
}

export async function getFilesUrl(
  key: string,
  bucket?: string
): Promise<{ url: string; key: string }> {
  const params = new URLSearchParams({ key });
  if (bucket) {
    params.set("bucket", bucket);
  }
  return requestApiJson<{ url: string; key: string }>(`${BASE}/url?${params}`, {
    method: "GET",
  });
}

export interface FilesPreviewPdfPayload {
  bucket: string;
  cached: boolean;
  key: string;
  sidecar_key: string;
  url: string;
}

export async function getFilesPreviewPdfUrl(
  key: string,
  bucket?: string,
  opts?: { force?: boolean; signal?: AbortSignal }
): Promise<FilesPreviewPdfPayload> {
  const params = new URLSearchParams({ key });
  if (bucket) {
    params.set("bucket", bucket);
  }
  if (opts?.force) {
    params.set("force", "1");
  }
  return requestApiJson<FilesPreviewPdfPayload>(
    `${BASE}/preview-pdf?${params}`,
    {
      method: "GET",
      signal: opts?.signal,
    }
  );
}

export type FilesThumbnailPayload = FilesPreviewPdfPayload;

export async function getFilesThumbnailUrl(
  key: string,
  bucket?: string,
  opts?: { force?: boolean; signal?: AbortSignal }
): Promise<FilesThumbnailPayload> {
  const params = new URLSearchParams({ key });
  if (bucket) {
    params.set("bucket", bucket);
  }
  if (opts?.force) {
    params.set("force", "1");
  }
  return requestApiJson<FilesThumbnailPayload>(`${BASE}/thumbnail?${params}`, {
    method: "GET",
    signal: opts?.signal,
  });
}

export interface FilesSignedUploadPayload {
  bucket: string;
  headers: Record<string, string>;
  key: string;
  url: string;
}

export async function requestSignedUploadUrl(input: {
  key: string;
  contentType: string;
  bucket?: string;
  expiresIn?: number;
}): Promise<FilesSignedUploadPayload> {
  const params = new URLSearchParams();
  if (input.bucket) {
    params.set("bucket", input.bucket);
  }
  const qs = params.toString();
  const url = qs
    ? `/api/file-storage/files/signed-upload-url?${qs}`
    : "/api/file-storage/files/signed-upload-url";
  return requestApiJson<FilesSignedUploadPayload>(url, {
    method: "POST",
    body: JSON.stringify({
      key: input.key,
      content_type: input.contentType,
      expires_in: input.expiresIn,
    }),
  });
}

export async function uploadViaSignedUrl(
  signed: FilesSignedUploadPayload,
  file: Blob,
  contentType?: string
): Promise<void> {
  const headers = new Headers(signed.headers ?? {});
  if (contentType && !headers.has("Content-Type")) {
    headers.set("Content-Type", contentType);
  }
  const response = await fetch(signed.url, {
    body: file,
    headers,
    method: "PUT",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Signed upload failed (${response.status})`);
  }
}

/** Largest single upload accepted through the signed-PUT path. */
export const FILES_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export interface UploadFileViaSignedUrlOptions {
  bucket?: string;
  /** Optional folder under the tenant root. If empty, files land at `tenants/<id>/<stamped-name>`. */
  prefix?: string;
  /** Engenty tenant id used to build the storage key prefix. */
  tenantId: string;
}

export interface UploadFileViaSignedUrlResult {
  bucket: string;
  filename: string;
  key: string;
  mime_type: string;
  size_bytes: number;
}

/** Build the tenant-scoped storage key the signed upload route will accept. */
export function buildVaultUploadKey(input: {
  filename: string;
  prefix?: string;
  tenantId: string;
  /** Override the timestamp segment in tests; defaults to `Date.now()`. */
  timestamp?: number;
}): string {
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stamped = `${input.timestamp ?? Date.now()}_${safeName}`;
  const tenantRoot = `tenants/${input.tenantId}/`;
  const trimmedPrefix = input.prefix?.replace(/^\/+|\/+$/g, "") ?? "";

  if (!trimmedPrefix) {
    return `${tenantRoot}${stamped}`;
  }
  if (trimmedPrefix === `tenants/${input.tenantId}`) {
    return `${tenantRoot}${stamped}`;
  }
  if (trimmedPrefix.startsWith(`tenants/${input.tenantId}/`)) {
    return `${trimmedPrefix}/${stamped}`;
  }
  if (trimmedPrefix.startsWith("tenants/")) {
    throw new Error("upload_prefix_outside_tenant");
  }
  return `${tenantRoot}${trimmedPrefix}/${stamped}`;
}

function resolveUploadContentType(file: File, safeName: string): string {
  const rawType = file.type?.trim() ?? "";
  if (
    !rawType ||
    rawType === "application/octet-stream" ||
    rawType === "application/x-download"
  ) {
    return guessFileStorageMimeFromFilename(safeName);
  }
  return rawType;
}

/**
 * Browser-direct Vault upload: requests a signed URL from core, PUTs the bytes,
 * and returns the assigned tenant-scoped key. Replaces the legacy multipart POST.
 */
export async function uploadFileViaSignedUrl(
  file: File,
  opts: UploadFileViaSignedUrlOptions
): Promise<UploadFileViaSignedUrlResult> {
  if (!opts.tenantId) {
    throw new Error("upload_tenant_required");
  }
  if (file.size > FILES_UPLOAD_MAX_BYTES) {
    throw new Error("upload_too_large");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const contentType = resolveUploadContentType(file, safeName);
  const key = buildVaultUploadKey({
    filename: file.name,
    prefix: opts.prefix,
    tenantId: opts.tenantId,
  });

  const signed = await requestSignedUploadUrl({
    bucket: opts.bucket,
    contentType,
    key,
  });
  await uploadViaSignedUrl(signed, file, contentType);

  return {
    bucket: signed.bucket,
    filename: file.name,
    key: signed.key,
    mime_type: contentType,
    size_bytes: file.size,
  };
}

export async function deleteFile(key: string, bucket?: string): Promise<void> {
  const params = new URLSearchParams({ key });
  if (bucket) {
    params.set("bucket", bucket);
  }
  await requestApiJson(`${BASE}?${params}`, { method: "DELETE" });
}

/** Stored JSON sidecar from POST /api/file-storage/files/extract */
export interface FilesExtractPayload {
  extracted_at: string;
  markdown: string;
  metadata?: Record<string, unknown>;
  source_mime: string;
}

export async function getFilesExtract(
  key: string,
  bucket?: string,
  signal?: AbortSignal
): Promise<FilesExtractPayload> {
  const params = new URLSearchParams({ key });
  if (bucket) {
    params.set("bucket", bucket);
  }
  return requestApiJson<FilesExtractPayload>(`${BASE}/extract?${params}`, {
    method: "GET",
    signal,
  });
}

export async function postFilesExtract(
  key: string,
  opts?: { bucket?: string }
): Promise<FilesExtractPayload> {
  return requestApiJson<FilesExtractPayload>(`${BASE}/extract`, {
    method: "POST",
    body: JSON.stringify({ key, bucket: opts?.bucket }),
  });
}
