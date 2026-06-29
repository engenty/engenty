import { Files, FilesError } from "files-sdk";
import { supabase } from "files-sdk/supabase";
import type {
  FileStorageProvider,
  FileStorageSignedUploadResult,
} from "../file-storage-types.js";

interface SupabaseProviderOptions {
  /** Bucket name, e.g. "files" */
  bucket: string;
  /** Supabase client instance (typed as `unknown` to avoid hard dep) */
  client: unknown;
}

interface SupabaseStorageBucket {
  copy(
    from: string,
    to: string
  ): Promise<{ error: { message: string } | null }>;
  getPublicUrl(key: string): { data: { publicUrl: string } };
  list(
    prefix?: string,
    opts?: { limit?: number; offset?: number; search?: string }
  ): Promise<{
    data: Array<{
      /** Null for subfolders (common prefixes); set for real objects. */
      id?: string | null;
      name: string;
      metadata?: Record<string, unknown> | null;
      created_at: string | null;
      updated_at: string | null;
    }> | null;
    error: { message: string } | null;
  }>;
  upload(
    key: string,
    data: Blob | ArrayBuffer | Uint8Array,
    opts?: { contentType?: string; upsert?: boolean }
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

interface SupabaseStorageClient {
  from(bucket: string): SupabaseStorageBucket;
}

function isNotFoundError(error: unknown): boolean {
  if (error instanceof FilesError && error.code === "NotFound") {
    return true;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("object not found") || message.includes("not found")
    );
  }
  return false;
}

function toProviderError(error: unknown, fallback: string): Error {
  if (error instanceof FilesError) {
    return new Error(`${fallback}: ${error.message}`);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(fallback);
}

function relativeName(prefix: string, key: string): string {
  const normalizedPrefix = prefix.replace(/\/+$/, "");
  if (!normalizedPrefix) {
    return key.split("/").pop() ?? key;
  }
  if (key.startsWith(`${normalizedPrefix}/`)) {
    return key.slice(normalizedPrefix.length + 1);
  }
  return key.split("/").pop() ?? key;
}

function timestampFromMs(value: number | undefined): string | undefined {
  if (value === undefined) {
    return;
  }
  return new Date(value).toISOString();
}

/**
 * Supabase Storage provider backed by files-sdk.
 */
export function createSupabaseFileStorageProvider(
  options: SupabaseProviderOptions
): FileStorageProvider {
  const { bucket, client } = options;
  const files = new Files({
    adapter: supabase({ bucket, client: client as never }),
  });
  const storageClient = files.adapter.raw as SupabaseStorageClient;
  const bucketRef = () => storageClient.from(bucket);

  return {
    id: "supabase",
    name: "Supabase Storage",

    async upload(key, data, opts) {
      try {
        if (opts?.upsert === false) {
          const { error } = await bucketRef().upload(key, data, {
            contentType: opts?.contentType,
            upsert: false,
          });
          if (error) {
            throw new Error(error.message);
          }
          return;
        }
        await files.upload(key, data, {
          contentType: opts?.contentType,
        });
      } catch (error) {
        throw toProviderError(error, "File storage upload failed");
      }
    },

    async download(key) {
      try {
        const stored = await files.download(key);
        return new Uint8Array(await stored.arrayBuffer());
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }
        throw toProviderError(error, "File storage download failed");
      }
    },

    async getUrl(key, opts) {
      if (opts?.signed === false) {
        return bucketRef().getPublicUrl(key).data.publicUrl;
      }
      try {
        return await files.url(key, {
          expiresIn: opts?.expiresIn ?? 3600,
        });
      } catch (error) {
        throw toProviderError(error, "Failed to create signed URL");
      }
    },

    async delete(key) {
      try {
        await files.delete(key);
      } catch (error) {
        throw toProviderError(error, "File storage delete failed");
      }
    },

    async list(prefix, opts) {
      const limit = opts?.limit ?? 100;
      const offset = opts?.offset ?? 0;

      if (opts?.search) {
        const { data, error } = await bucketRef().list(prefix || undefined, {
          limit,
          offset,
          search: opts.search,
        });
        if (error) {
          throw new Error(`File storage list failed: ${error.message}`);
        }
        const filesListed = (data ?? []).map((entry) => ({
          name: entry.name,
          metadata: entry.metadata ?? undefined,
          created_at: entry.created_at ?? undefined,
          updated_at: entry.updated_at ?? undefined,
        }));
        return { files: filesListed, total: filesListed.length };
      }

      try {
        const result = await files.list({
          prefix: prefix || undefined,
          limit,
          cursor: offset > 0 ? String(offset) : undefined,
        });

        const filesListed = result.items.map((item) => ({
          name: relativeName(prefix, item.key),
          metadata: item.metadata as Record<string, unknown> | undefined,
          created_at: timestampFromMs(item.lastModified),
          updated_at: timestampFromMs(item.lastModified),
        }));

        return { files: filesListed, total: filesListed.length };
      } catch (error) {
        throw toProviderError(error, "File storage list failed");
      }
    },

    async listChildren(prefix, opts) {
      // Raw Supabase list() is single-level: subfolders come back as entries
      // with a null `id` (no metadata); real objects carry an `id` + metadata.
      const folderPath = (prefix ?? "").replace(/\/+$/, "");
      const { data, error } = await bucketRef().list(folderPath || undefined, {
        limit: opts?.limit ?? 1000,
        offset: opts?.offset ?? 0,
      });
      if (error) {
        throw new Error(`File storage list failed: ${error.message}`);
      }
      const folders: Array<{ name: string }> = [];
      const filesListed: Array<{
        name: string;
        metadata?: Record<string, unknown>;
        created_at?: string;
        updated_at?: string;
      }> = [];
      for (const entry of data ?? []) {
        if (entry.name === ".emptyFolderPlaceholder") {
          continue;
        }
        if (entry.id == null) {
          folders.push({ name: entry.name });
        } else {
          filesListed.push({
            name: entry.name,
            metadata: entry.metadata ?? undefined,
            created_at: entry.created_at ?? undefined,
            updated_at: entry.updated_at ?? undefined,
          });
        }
      }
      return { folders, files: filesListed };
    },

    async exists(key) {
      try {
        return await files.exists(key);
      } catch (error) {
        if (isNotFoundError(error)) {
          return false;
        }
        throw toProviderError(error, "File storage exists check failed");
      }
    },

    async copy(src, dest) {
      try {
        await files.copy(src, dest);
      } catch (error) {
        throw toProviderError(error, "File storage copy failed");
      }
    },

    async signedUploadUrl(key, opts) {
      if (opts?.maxSize !== undefined) {
        throw new Error(
          "Supabase signed upload URLs do not support maxSize; enforce limits at the gateway"
        );
      }
      try {
        const signed = await files.signedUploadUrl(key, {
          contentType: opts?.contentType,
          expiresIn: opts?.expiresIn ?? 7200,
        });
        if (signed.method !== "PUT") {
          throw new Error(
            "Unexpected signed upload method from Supabase adapter"
          );
        }
        return {
          key,
          url: signed.url,
          headers: signed.headers,
        } satisfies FileStorageSignedUploadResult;
      } catch (error) {
        throw toProviderError(error, "Failed to create signed upload URL");
      }
    },
  };
}
