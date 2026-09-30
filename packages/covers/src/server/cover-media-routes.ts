/**
 * Cover media routes for one owner kind (a knowledge base, a project, …):
 * an upload key, Unsplash search/import and AI generate/edit, all storing
 * into the owner's own storage folder.
 *
 * The owning module decides the path and how to find the owner; this file
 * decides what a cover image is. Routes registered under `basePath`:
 * `/upload-key`, `/unsplash/search`, `/unsplash/import`, `/ai`.
 */

import {
  generateImageBytes,
  ImageModelGatewayError,
  type ImageReference,
  ModelRoleNotBoundError,
  readAiGatewayApiKeyFromEnv,
  resolvePlatformImageModelId,
} from "@engenty/ai-core";
import { guessFileStorageMimeFromFilename } from "@engenty/file-storage";
import type {
  PluginAuthContext,
  PluginHttpRouteContext,
  PluginServerApi,
  StorageService,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import { z } from "zod";
import type { Cover, CoverImageSourceUnsplash } from "../cover.js";

const logger = createLogger({ name: "cover-media" });

const UNSPLASH_API = "https://api.unsplash.com";

const coverAiBodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  mode: z.enum(["generate", "edit"]),
  reference_object_key: z.string().min(1).max(2048).optional(),
});

const unsplashImportBodySchema = z.object({
  photo_id: z.string().min(1).max(128),
});

const uploadKeyBodySchema = z.object({
  filename: z.string().min(1).max(512),
});

/** Where one owner's files live. */
export interface CoverOwner {
  /** Whether a storage key belongs to this owner (AI edit references). */
  isOwnKey: (key: string) => boolean;
  /** A storage key under the owner's folder. */
  storageKey: (...segments: string[]) => string;
}

export interface CoverMediaRoutesOptions {
  /** e.g. `/api/kb/cover`. */
  basePath: string;
  /** Message for a 404 when the owner is not found (or not visible). */
  notFoundMessage: string;
  /** Request-body field naming the owner, e.g. `kb_id`. */
  ownerField: string;
  resolveOwner: (
    auth: PluginAuthContext,
    ownerId: string
  ) => Promise<CoverOwner | null>;
}

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function notConfigured(msg: string) {
  return bad(msg, 503);
}

function coverKey(owner: CoverOwner, filenameHint: string): string {
  const safe = filenameHint.replace(/[^a-zA-Z0-9._-]/g, "_") || "cover.png";
  return owner.storageKey("covers", `${Date.now()}_${safe}`);
}

async function uploadCoverBytes(
  storage: StorageService,
  owner: CoverOwner,
  bytes: Uint8Array,
  filenameHint: string
): Promise<{ key: string; contentType: string }> {
  const key = coverKey(owner, filenameHint);
  const contentType = guessFileStorageMimeFromFilename(key);
  await storage.upload(key, bytes, { contentType, upsert: true });
  return { key, contentType };
}

export function registerCoverMediaRoutes(
  api: Pick<PluginServerApi, "getStorageService" | "registerHttpRoute">,
  options: CoverMediaRoutesOptions
) {
  const { basePath, notFoundMessage, ownerField, resolveOwner } = options;
  const ownerIdSchema = z.object({ [ownerField]: z.string().uuid() });

  /** The owner named in a request body, or a response explaining why not. */
  async function ownerFromBody(
    auth: PluginAuthContext,
    body: unknown
  ): Promise<CoverOwner | Response> {
    const parsed = ownerIdSchema.safeParse(body);
    if (!parsed.success) {
      return bad(`${ownerField} required`);
    }
    const owner = await resolveOwner(
      auth,
      (parsed.data as Record<string, string>)[ownerField]
    );
    return owner ?? bad(notFoundMessage, 404);
  }

  api.registerHttpRoute({
    method: "post",
    path: `${basePath}/upload-key`,
    handler: async (ctx: PluginHttpRouteContext) => {
      if (!ctx.auth) {
        return bad("Auth required", 401);
      }
      const raw = await ctx.request.json().catch(() => ({}));
      const owner = await ownerFromBody(ctx.auth, raw);
      if (owner instanceof Response) {
        return owner;
      }
      const body = uploadKeyBodySchema.parse(raw);
      // The browser exchanges this key at `/api/file-storage/files/signed-upload-url`,
      // which enforces tenant scope; this route only decides WHERE.
      return { key: coverKey(owner, body.filename) };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: `${basePath}/unsplash/search`,
    handler: async (ctx: PluginHttpRouteContext) => {
      if (!ctx.auth) {
        return bad("Auth required", 401);
      }
      const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
      if (!key) {
        return notConfigured("Unsplash is not configured");
      }
      const url = new URL(ctx.request.url);
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length < 1) {
        return bad("q required");
      }
      const page = Math.max(
        1,
        Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1
      );
      const sp = new URLSearchParams({
        query: q,
        page: String(page),
        per_page: "20",
      });
      const res = await fetch(`${UNSPLASH_API}/search/photos?${sp}`, {
        headers: { Authorization: `Client-ID ${key}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.warn("Unsplash search failed", {
          status: res.status,
          text: text.slice(0, 200),
        });
        return bad("Unsplash search failed", res.status >= 500 ? 502 : 400);
      }
      const raw = (await res.json()) as {
        results?: Array<{
          id: string;
          urls?: { thumb?: string; small?: string; regular?: string };
          user?: { name?: string; links?: { html?: string } };
          links?: { html?: string };
        }>;
      };
      const results = Array.isArray(raw.results) ? raw.results : [];
      const photos = results.map((p) => ({
        id: p.id,
        urls: {
          thumb: p.urls?.thumb ?? p.urls?.small ?? "",
          small: p.urls?.small ?? p.urls?.thumb ?? "",
          regular: p.urls?.regular ?? p.urls?.small ?? "",
        },
        user: {
          name: p.user?.name ?? "",
          links: { html: p.user?.links?.html ?? "" },
        },
        links: { html: p.links?.html ?? "" },
      }));
      return { photos };
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: `${basePath}/unsplash/import`,
    handler: async (ctx: PluginHttpRouteContext) => {
      if (!ctx.auth) {
        return bad("Auth required", 401);
      }
      const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
      if (!accessKey) {
        return notConfigured("Unsplash is not configured");
      }
      const storage = api.getStorageService?.("files") ?? null;
      if (!storage) {
        return notConfigured("File storage not available");
      }
      const raw = await ctx.request.json().catch(() => ({}));
      const owner = await ownerFromBody(ctx.auth, raw);
      if (owner instanceof Response) {
        return owner;
      }
      const body = unsplashImportBodySchema.parse(raw);

      const headers = { Authorization: `Client-ID ${accessKey}` };
      const dlTrack = await fetch(
        `${UNSPLASH_API}/photos/${encodeURIComponent(body.photo_id)}/download`,
        { headers }
      );
      if (!dlTrack.ok) {
        return bad("Unsplash download tracking failed", 502);
      }
      const dlJson = (await dlTrack.json()) as { url?: string };
      const imageUrl = dlJson.url?.trim();
      if (!imageUrl) {
        return bad("Unsplash download response invalid", 502);
      }
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        return bad("Failed to fetch image bytes", 502);
      }
      const buf = new Uint8Array(await imgRes.arrayBuffer());
      if (buf.byteLength < 32) {
        return bad("Image too small or empty", 400);
      }

      const photoMeta = await fetch(
        `${UNSPLASH_API}/photos/${encodeURIComponent(body.photo_id)}`,
        { headers }
      );
      let source: CoverImageSourceUnsplash | undefined;
      if (photoMeta.ok) {
        const meta = (await photoMeta.json()) as {
          user?: { name?: string; links?: { html?: string } };
          links?: { html?: string };
        };
        const name = meta.user?.name?.trim();
        const photographerUrl = meta.user?.links?.html?.trim();
        const photoUrl = meta.links?.html?.trim();
        if (name && photographerUrl && photoUrl) {
          source = {
            kind: "unsplash",
            photo_url: photoUrl,
            photographer_name: name,
            photographer_url: photographerUrl,
          };
        }
      }

      const ext = imgRes.headers.get("content-type")?.includes("png")
        ? "png"
        : "jpg";
      const { key } = await uploadCoverBytes(
        storage,
        owner,
        buf,
        `unsplash_${body.photo_id}.${ext}`
      );

      const cover: Cover = source
        ? { type: "image", value: key, source }
        : { type: "image", value: key };

      return { key, cover };
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: `${basePath}/ai`,
    handler: async (ctx: PluginHttpRouteContext) => {
      if (!ctx.auth) {
        return bad("Auth required", 401);
      }
      const gatewayKey = readAiGatewayApiKeyFromEnv();
      if (!gatewayKey) {
        return notConfigured("AI Gateway not configured");
      }
      const storage = api.getStorageService?.("files") ?? null;
      if (!storage) {
        return notConfigured("File storage not available");
      }

      const raw = await ctx.request.json().catch(() => ({}));
      const owner = await ownerFromBody(ctx.auth, raw);
      if (owner instanceof Response) {
        return owner;
      }
      const body = coverAiBodySchema.parse(raw);

      let modelId: string;
      try {
        modelId = resolvePlatformImageModelId();
      } catch (err) {
        if (
          !(
            err instanceof ImageModelGatewayError ||
            err instanceof ModelRoleNotBoundError
          )
        ) {
          throw err;
        }
        return notConfigured(err.message);
      }

      let reference: ImageReference | null = null;
      if (body.mode === "edit") {
        const refKey = body.reference_object_key?.trim();
        if (!refKey) {
          return bad("reference_object_key required for edit mode");
        }
        if (!owner.isOwnKey(refKey)) {
          return bad("Invalid reference_object_key for this owner", 403);
        }
        const downloaded = await storage.download(refKey);
        if (!downloaded || downloaded.byteLength === 0) {
          return bad("Reference image not found", 404);
        }
        reference = {
          bytes: downloaded,
          mediaType: guessFileStorageMimeFromFilename(refKey),
        };
      }

      try {
        const bytes = await generateImageBytes({
          modelId,
          prompt: body.prompt,
          reference,
        });
        const { key } = await uploadCoverBytes(
          storage,
          owner,
          bytes,
          `ai_cover_${Date.now()}.png`
        );
        const cover: Cover = { type: "image", value: key };
        return { key, cover };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("Cover AI generation failed", { modelId, error: msg });
        const lower = msg.toLowerCase();
        if (
          lower.includes("not supported") ||
          lower.includes("unsupported") ||
          lower.includes("image input") ||
          lower.includes("cannot")
        ) {
          return new Response(
            JSON.stringify({
              ok: false,
              error:
                'This image model may not support the requested operation. Try generate-only or bind the "Image generation" model role to an image model that supports reference editing.',
            }),
            { status: 501, headers: { "content-type": "application/json" } }
          );
        }
        return bad(msg, 502);
      }
    },
  });
}
