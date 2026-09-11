/**
 * Hub cover helpers: Unsplash search/import (vault-backed) and AI image generate/edit.
 */

import { readAiGatewayApiKeyFromEnv } from "@engenty/ai-core";
import { guessFileStorageMimeFromFilename } from "@engenty/file-storage";
import type {
  PluginAuthContext,
  PluginHttpRouteContext,
  PluginServerApi,
  StorageService,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import { generateImage } from "ai";
import { z } from "zod";
import type { KbRepoFactory } from "../dal/contracts.js";
import {
  isKbStorageKey,
  type KbStorageOwner,
  kbStorageKey,
} from "../lib/kb-storage-key.js";
import type {
  KbCover,
  KbCoverImageSourceUnsplash,
} from "../schema/knowledge-bases.js";

const logger = createLogger({ name: "kb-cover-media" });

const UNSPLASH_API = "https://api.unsplash.com";

const kbCoverAiBodySchema = z.object({
  kb_id: z.string().uuid(),
  prompt: z.string().min(1).max(2000),
  mode: z.enum(["generate", "edit"]),
  reference_object_key: z.string().min(1).max(2048).optional(),
});

const unsplashImportBodySchema = z.object({
  kb_id: z.string().uuid(),
  photo_id: z.string().min(1).max(128),
});

type RepoFactory = KbRepoFactory;

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function notConfigured(msg: string) {
  return bad(msg, 503);
}

async function uploadCoverBytes(
  storage: StorageService,
  kb: KbStorageOwner,
  bytes: Uint8Array,
  filenameHint: string
): Promise<{ key: string; contentType: string }> {
  const safe = filenameHint.replace(/[^a-zA-Z0-9._-]/g, "_") || "cover.png";
  const key = kbStorageKey(kb, "covers", `${Date.now()}_${safe}`);
  const contentType = guessFileStorageMimeFromFilename(safe);
  await storage.upload(key, bytes, { contentType, upsert: true });
  return { key, contentType };
}

export function registerKbCoverMediaRoutes(
  api: Pick<PluginServerApi, "getStorageService" | "registerHttpRoute"> & {
    config?: Record<string, unknown>;
  },
  getRepo: (auth?: PluginAuthContext) => RepoFactory
) {
  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/cover/unsplash/search",
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
    path: "/api/kb/cover/unsplash/import",
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
      const body = unsplashImportBodySchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const repos = getRepo(ctx.auth);
      const kb = await repos.kb.getById(body.kb_id);
      if (!kb) {
        return bad("Knowledge base not found", 404);
      }

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
      let source: KbCoverImageSourceUnsplash | undefined;
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
        kb,
        buf,
        `unsplash_${body.photo_id}.${ext}`
      );

      const cover: KbCover = source
        ? { type: "image", value: key, source }
        : { type: "image", value: key };

      return { key, cover };
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/cover/ai",
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

      const body = kbCoverAiBodySchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const repos = getRepo(ctx.auth);
      const kb = await repos.kb.getById(body.kb_id);
      if (!kb) {
        return bad("Knowledge base not found", 404);
      }

      const tenantId = ctx.auth.tenantId;
      const modelId =
        process.env.AI_GATEWAY_IMAGE_MODEL?.trim() ||
        (typeof api.config?.aiImageModel === "string"
          ? api.config.aiImageModel.trim()
          : "") ||
        "openai/gpt-image-1";

      let referenceBytes: Uint8Array | null = null;
      if (body.mode === "edit") {
        const refKey = body.reference_object_key?.trim();
        if (!refKey) {
          return bad("reference_object_key required for edit mode");
        }
        if (!isKbStorageKey(kb, refKey)) {
          return bad(
            "Invalid reference_object_key for this knowledge base",
            403
          );
        }
        const downloaded = await storage.download(refKey);
        if (!downloaded || downloaded.byteLength === 0) {
          return bad("Reference image not found", 404);
        }
        referenceBytes = downloaded;
      }

      const promptArg =
        body.mode === "edit" && referenceBytes
          ? {
              images: [referenceBytes],
              text: body.prompt,
            }
          : body.prompt;

      try {
        const result = await generateImage({
          model: modelId,
          prompt: promptArg,
          n: 1,
        });
        const img = result.image ?? result.images?.[0];
        if (!img) {
          return bad("No image generated", 502);
        }
        const bytes =
          img.uint8Array && img.uint8Array.byteLength > 0
            ? img.uint8Array
            : img.base64
              ? Uint8Array.from(atob(img.base64), (ch) => ch.charCodeAt(0))
              : null;
        if (!bytes || bytes.byteLength === 0) {
          return bad("No image bytes in model response", 502);
        }
        const { key } = await uploadCoverBytes(
          storage,
          kb,
          bytes,
          `ai_cover_${Date.now()}.png`
        );
        const cover: KbCover = { type: "image", value: key };
        return { key, cover };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("KB cover AI generation failed", { modelId, error: msg });
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
                "This image model may not support the requested operation. Try generate-only or set AI_GATEWAY_IMAGE_MODEL to an image model that supports reference editing.",
            }),
            { status: 501, headers: { "content-type": "application/json" } }
          );
        }
        return bad(msg, 502);
      }
    },
  });
}
