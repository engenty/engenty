/**
 * Where a cover's images come from and go to. A module passes one of these to
 * `CoverDialog`; each capability it leaves out hides that part of the picker.
 */
import { requestApiJson } from "@engenty/api-client";
import type { Cover } from "../cover.js";

export interface UnsplashCoverPhoto {
  id: string;
  links: { html: string };
  urls: { regular: string; small: string; thumb: string };
  user: { links: { html: string }; name: string };
}

export interface CoverAiInput {
  mode: "generate" | "edit";
  prompt: string;
  reference_object_key?: string;
}

export interface CoverMediaAdapter {
  ai?: (input: CoverAiInput) => Promise<Cover>;
  unsplash?: {
    importPhoto: (photoId: string) => Promise<Cover>;
    search: (q: string) => Promise<{ photos: UnsplashCoverPhoto[] }>;
  };
  /** Stores an image file for this owner and resolves to its storage key. */
  upload?: (file: File) => Promise<string>;
}

/**
 * The adapter for routes registered with `registerCoverMediaRoutes` on the
 * server: `<basePath>/upload-key`, `/unsplash/search`, `/unsplash/import` and
 * `/ai`, each naming its owner by `ownerField`.
 */
export function createCoverMediaHttpAdapter(options: {
  basePath: string;
  ownerField: string;
  ownerId: string;
  /** Replace the upload step (a module with its own upload contract). */
  upload?: CoverMediaAdapter["upload"];
}): CoverMediaAdapter {
  const { basePath, ownerField, ownerId } = options;
  const owner = { [ownerField]: ownerId };
  const post = <T>(path: string, body: Record<string, unknown>) =>
    requestApiJson<T>(`${basePath}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...owner, ...body }),
    });

  return {
    upload:
      options.upload ??
      (async (file) => {
        const contentType = file.type || "application/octet-stream";
        const { key } = await post<{ key: string }>("/upload-key", {
          filename: file.name,
        });
        const signed = await requestApiJson<{
          headers?: Record<string, string>;
          key: string;
          url: string;
        }>("/api/file-storage/files/signed-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, content_type: contentType }),
        });
        const res = await fetch(signed.url, {
          method: "PUT",
          headers: { "Content-Type": contentType, ...(signed.headers ?? {}) },
          body: file,
        });
        if (!res.ok) {
          throw new Error(`Upload failed (${res.status})`);
        }
        return signed.key;
      }),
    unsplash: {
      search: (q) =>
        requestApiJson<{ photos: UnsplashCoverPhoto[] }>(
          `${basePath}/unsplash/search?${new URLSearchParams({ q: q.trim() })}`,
          { method: "GET" }
        ),
      importPhoto: async (photoId) =>
        (
          await post<{ cover: Cover; key: string }>("/unsplash/import", {
            photo_id: photoId,
          })
        ).cover,
    },
    ai: async (input) =>
      (await post<{ cover: Cover; key: string }>("/ai", { ...input })).cover,
  };
}
