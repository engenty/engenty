import type { FileStorageFile } from "@engenty/file-storage";

import {
  EngentyCoreClient,
  type EngentyCoreClientOptions,
} from "../core-http-client.js";

export interface EngentyCoreFileStorageClient {
  copy(srcKey: string, destKey: string): Promise<void>;
  delete(key: string): Promise<void>;
  download(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string, options?: { expiresIn?: number }): Promise<string>;
  list(
    prefix: string,
    options?: { limit?: number; recursive?: boolean }
  ): Promise<FileStorageFile[]>;
  upload(
    key: string,
    data: Uint8Array,
    options?: {
      contentType?: string;
      module?: string;
      upsert?: boolean;
    }
  ): Promise<void>;
}

export interface CreateEngentyCoreFileStorageClientOptions
  extends EngentyCoreClientOptions {
  bucket?: string;
}

function normalizeCoreBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function createEngentyCoreFileStorageClient(
  options: CreateEngentyCoreFileStorageClientOptions
): EngentyCoreFileStorageClient {
  const core = new EngentyCoreClient(options);
  const bucket = options.bucket?.trim() || undefined;
  const bearerToken = options.accessToken.trim();
  const coreBaseUrl = normalizeCoreBaseUrl(options.coreBaseUrl);

  function buildUrl(path: string, params: Record<string, string>): URL {
    const url = new URL(path, coreBaseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    if (bucket) {
      url.searchParams.set("bucket", bucket);
    }
    return url;
  }

  async function fetchBytes(
    path: string,
    init: RequestInit & { params?: Record<string, string> } = {}
  ): Promise<Response> {
    const { params = {}, ...rest } = init;
    const url = buildUrl(path, params);
    const fetchImpl = options.fetchImpl ?? fetch;
    return fetchImpl(url, {
      ...rest,
      headers: {
        Authorization: `Bearer ${bearerToken.replace(/^Bearer\s+/i, "").trim()}`,
        ...(rest.headers ?? {}),
      },
    });
  }

  return {
    async copy(srcKey, destKey) {
      const bytes = await this.download(srcKey);
      if (!bytes) {
        throw new Error(`file_storage_copy_source_missing:${srcKey}`);
      }
      await this.upload(destKey, bytes, { upsert: true });
    },

    async delete(key) {
      const params = new URLSearchParams({ key });
      if (bucket) {
        params.set("bucket", bucket);
      }
      await core.request<null>(`/api/file-storage/files?${params.toString()}`, {
        method: "DELETE",
      });
    },

    async download(key) {
      const response = await fetchBytes("/api/file-storage/files/bytes", {
        method: "GET",
        params: { key },
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          text || `file_storage_download_failed:${response.status}`
        );
      }
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    },

    async exists(key) {
      const response = await fetchBytes("/api/file-storage/files/bytes", {
        method: "HEAD",
        params: { key },
      });
      if (response.status === 404) {
        return false;
      }
      if (!response.ok) {
        throw new Error(`file_storage_exists_failed:${response.status}`);
      }
      return true;
    },

    async getUrl(key, _options) {
      const params = new URLSearchParams({ key });
      if (bucket) {
        params.set("bucket", bucket);
      }
      const payload = await core.request<{ url: string }>(
        `/api/file-storage/files/url?${params.toString()}`
      );
      return payload.url;
    },

    async list(prefix, listOptions) {
      const params = new URLSearchParams();
      params.set("prefix", prefix);
      params.set("limit", String(listOptions?.limit ?? 1000));
      if (listOptions?.recursive === false) {
        params.set("recursive", "false");
      }
      if (bucket) {
        params.set("bucket", bucket);
      }
      return core.request<FileStorageFile[]>(
        `/api/file-storage/files?${params.toString()}`
      );
    },

    async upload(key, data, uploadOptions) {
      const params: Record<string, string> = { key };
      if (uploadOptions?.upsert === false) {
        params.upsert = "false";
      }
      if (uploadOptions?.contentType) {
        params.contentType = uploadOptions.contentType;
      }
      if (uploadOptions?.module) {
        params.module = uploadOptions.module;
      }
      const response = await fetchBytes("/api/file-storage/files/bytes", {
        body: data,
        headers: {
          "Content-Type":
            uploadOptions?.contentType ?? "application/octet-stream",
        },
        method: "PUT",
        params,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          text || `file_storage_upload_failed:${response.status}`
        );
      }
    },
  };
}
