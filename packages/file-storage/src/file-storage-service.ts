import type {
  FileStorageChildrenResult,
  FileStorageFile,
  FileStorageProvider,
  FileStorageService,
} from "./file-storage-types.js";

/* ── MIME detection helpers ── */

const EXTENSION_MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  csv: "text/csv",
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odt: "application/vnd.oasis.opendocument.text",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  rtf: "application/rtf",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * Infer MIME type from filename extension (for uploads where the browser sends
 * `application/octet-stream` or an empty type).
 */
export function guessFileStorageMimeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME_MAP[ext] ?? "application/octet-stream";
}

function guessMimeType(filename: string): string {
  return guessFileStorageMimeFromFilename(filename);
}

function extractFilename(key: string): string {
  return key.split("/").pop() ?? key;
}

/** Supabase Storage list() puts byte size on `metadata.size` (not top-level). */
function sizeBytesFromListMetadata(metadata?: Record<string, unknown>): number {
  if (!metadata) {
    return 0;
  }
  const s = metadata.size;
  if (typeof s === "number" && Number.isFinite(s)) {
    return s;
  }
  if (typeof s === "string") {
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/* ── FileStorageService factory ── */

export interface CreateFileStorageServiceOptions {
  /** Default bucket/namespace prefix (e.g. for tenant scoping) */
  pathPrefix?: string;
  /** The storage provider to use */
  provider: FileStorageProvider;
}

/**
 * Creates a FileStorageService that wraps a FileStorageProvider.
 *
 * Currently metadata is derived from the provider's list/download responses.
 * In Phase 2, a `file_storage_objects` DB table will track richer metadata.
 */
export function createFileStorageService(
  options: CreateFileStorageServiceOptions
): FileStorageService {
  const { provider, pathPrefix } = options;

  /** Resolve a key with optional path prefix */
  function resolveKey(key: string): string {
    if (!pathPrefix) {
      return key;
    }
    // Avoid double slashes
    const prefix = pathPrefix.endsWith("/") ? pathPrefix : `${pathPrefix}/`;
    return key.startsWith(prefix) ? key : `${prefix}${key}`;
  }

  function toFileStorageFile(
    key: string,
    extra?: {
      size_bytes?: number;
      mime_type?: string;
      module?: string;
      metadata?: Record<string, unknown>;
      created_at?: string;
      updated_at?: string;
    }
  ): FileStorageFile {
    const filename = extractFilename(key);
    const now = new Date().toISOString();
    return {
      key,
      filename,
      mime_type: extra?.mime_type ?? guessMimeType(filename),
      size_bytes: extra?.size_bytes ?? 0,
      module: extra?.module,
      metadata: extra?.metadata,
      created_at: extra?.created_at ?? now,
      updated_at: extra?.updated_at ?? now,
    };
  }

  return {
    async upload(key, data, uploadOptions) {
      const resolved = resolveKey(key);
      const contentType =
        uploadOptions?.contentType ?? guessMimeType(extractFilename(key));

      await provider.upload(resolved, data, {
        contentType,
        upsert: uploadOptions?.upsert,
      });

      const size =
        data instanceof ArrayBuffer
          ? data.byteLength
          : data instanceof Uint8Array
            ? data.byteLength
            : ((data as Blob).size ?? 0);

      return toFileStorageFile(resolved, {
        size_bytes: size,
        mime_type: contentType,
        module: uploadOptions?.module,
        metadata: uploadOptions?.metadata,
      });
    },

    async download(key) {
      return provider.download(resolveKey(key));
    },

    async getUrl(key, urlOptions) {
      return provider.getUrl(resolveKey(key), {
        signed: urlOptions?.signed ?? true, // default to signed for security
        expiresIn: urlOptions?.expiresIn ?? 3600,
      });
    },

    async delete(key) {
      await provider.delete(resolveKey(key));
    },

    async list(prefix, listOptions) {
      const resolved = resolveKey(prefix);
      const result = await provider.list(resolved, {
        limit: listOptions?.limit ?? 50,
        offset: listOptions?.offset ?? 0,
        search: listOptions?.search,
      });

      const files: FileStorageFile[] = result.files.map((f) => {
        const fullKey = resolved
          ? `${resolved}/${f.name}`.replace(/\/+/g, "/")
          : f.name;
        const meta = f.metadata as Record<string, unknown> | undefined;
        return toFileStorageFile(fullKey, {
          metadata: meta,
          created_at: f.created_at,
          updated_at: f.updated_at,
          size_bytes: sizeBytesFromListMetadata(meta),
        });
      });

      return { files, total: result.total };
    },

    async listChildren(
      prefix,
      listOptions
    ): Promise<FileStorageChildrenResult> {
      const resolved = resolveKey(prefix);
      const joinKey = (name: string) =>
        (resolved ? `${resolved}/${name}` : name).replace(/\/+/g, "/");

      if (!provider.listChildren) {
        // Provider can't list folders — fall back to a flat listing.
        const flat = await provider.list(resolved, {
          limit: listOptions?.limit ?? 1000,
          offset: listOptions?.offset ?? 0,
        });
        const files = flat.files.map((f) => {
          const meta = f.metadata as Record<string, unknown> | undefined;
          return toFileStorageFile(joinKey(f.name), {
            metadata: meta,
            created_at: f.created_at,
            updated_at: f.updated_at,
            size_bytes: sizeBytesFromListMetadata(meta),
          });
        });
        return { folders: [], files };
      }

      const result = await provider.listChildren(resolved, {
        limit: listOptions?.limit ?? 1000,
        offset: listOptions?.offset ?? 0,
      });
      const files = result.files.map((f) => {
        const meta = f.metadata as Record<string, unknown> | undefined;
        return toFileStorageFile(joinKey(f.name), {
          metadata: meta,
          created_at: f.created_at,
          updated_at: f.updated_at,
          size_bytes: sizeBytesFromListMetadata(meta),
        });
      });
      const folders = result.folders.map((d) => ({
        name: d.name,
        prefix: `${joinKey(d.name)}/`,
      }));
      return { folders, files };
    },

    async exists(key) {
      return provider.exists(resolveKey(key));
    },

    async copy(src, dest) {
      const resolvedSrc = resolveKey(src);
      const resolvedDest = resolveKey(dest);
      await provider.copy(resolvedSrc, resolvedDest);
      return toFileStorageFile(resolvedDest);
    },

    async signedUploadUrl(key, uploadOptions) {
      if (!provider.signedUploadUrl) {
        throw new Error(
          "Signed upload URLs are not supported by this provider"
        );
      }
      const resolved = resolveKey(key);
      return provider.signedUploadUrl(resolved, uploadOptions);
    },

    async getFile(key) {
      const resolved = resolveKey(key);
      const fileExists = await provider.exists(resolved);
      if (!fileExists) {
        return null;
      }
      return toFileStorageFile(resolved);
    },
  };
}
