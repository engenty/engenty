import type { PluginEventsApi } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import { z } from "zod";
import type { KbRepoFactory } from "../dal/contracts.js";
import { enrichKbFromSettings, enrichKbWithSettings } from "../dal/shared.js";
import { kbStorageKey } from "../lib/kb-storage-key.js";
import { normalizeKbPageLayoutSettings } from "../schema/page-blocks.js";
import type { KbDisplay, KbSettings } from "../schema/types.js";
import { knowledgeBaseUpdateSchema } from "../schema/zod.js";
import type { GetKbRepo, KbServerApi } from "./kb-api-shared.js";
import { notFound } from "./kb-api-shared.js";

const logger = createLogger({ name: "kb-api" });

const kbUploadKeySchema = z.object({
  kb_id: z.string().uuid(),
  filename: z.string().min(1).max(512),
  /** Optional folder under the KB root, e.g. `covers`. */
  sub_path: z.string().max(256).optional(),
});

/**
 * Emitted after a knowledge base changes space. The index row of every article
 * carries the KB's `space_id` (the one surface a private space's content can
 * escape through), so the retrieval source re-indexes them all off this one
 * event — `article_ids` is the doc list, not a hint.
 */
export const KB_SPACE_CHANGED_EVENT = "knowledge-base.kb.space_changed";

export interface KbSpaceChangedPayload {
  article_ids: string[];
  kb_id: string;
  scope_id: string;
  tenant_id: string;
}

async function emitKbSpaceChanged(
  events: PluginEventsApi,
  repos: KbRepoFactory,
  kb: { id: string; scope_id: string; tenant_id: string }
): Promise<void> {
  const nodes = await repos.articles.listAllForGraph(kb.id);
  const articleIds = nodes.map((node) => String(node.id));
  if (articleIds.length === 0) {
    return;
  }
  await events.modules.emit(
    KB_SPACE_CHANGED_EVENT,
    {
      article_ids: articleIds,
      kb_id: kb.id,
      scope_id: kb.scope_id,
      tenant_id: kb.tenant_id,
    } satisfies KbSpaceChangedPayload,
    { tenantId: kb.tenant_id }
  );
}

export function registerKbKnowledgeBaseRoutes(
  api: KbServerApi,
  getRepo: GetKbRepo,
  events: PluginEventsApi
) {
  /* ── Knowledge Bases CRUD ── */

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/knowledge-bases",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      // `?space_id=` narrows to exactly that space's libraries (the space
      // Drive reads this). No tenant-wide tier since Phase 6b.
      const spaceId =
        new URL(ctx.request.url).searchParams.get("space_id") || null;
      const [kbs, settings] = await Promise.all([
        repos.kb.list(spaceId ? { spaceId } : undefined),
        repos.settings.get(),
      ]);
      return kbs.map((kb) => enrichKbWithSettings(kb, settings));
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/knowledge-bases/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const [kb, settings] = await Promise.all([
        repos.kb.getById(params.id),
        repos.settings.get(),
      ]);
      if (!kb) {
        return notFound();
      }
      return enrichKbWithSettings(kb, settings);
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/kb/knowledge-bases/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const body = knowledgeBaseUpdateSchema.parse(
        await ctx.request.json().catch(() => ({}))
      );

      /* Split KV-backed fields from KB table fields. */
      const { icon, cover, page_layout, chunking, ...kbBody } = body;
      const hasDisplayUpdate = icon !== undefined || cover !== undefined;
      const hasPageLayoutUpdate = page_layout !== undefined;
      const hasChunkingUpdate = chunking !== undefined;

      let displayById: KbSettings["kb_display_by_id"] = {};
      let pageLayoutById: KbSettings["kb_page_layout_by_id"] = {};
      let chunkingById: KbSettings["kb_chunking_by_id"] = {};

      const settings = await repos.settings.get();
      displayById = settings.kb_display_by_id;
      pageLayoutById = settings.kb_page_layout_by_id;
      chunkingById = settings.kb_chunking_by_id;

      // Read BEFORE the update: a space move is detected by comparison.
      const before = await repos.kb.getById(params.id);
      if (!before) {
        return notFound();
      }

      if (hasDisplayUpdate) {
        const patch: Partial<KbDisplay> = {};
        if (icon !== undefined) {
          patch.icon = icon;
        }
        if (cover !== undefined) {
          patch.cover = cover;
        }
        const next = await repos.settings.patchKbDisplay(params.id, patch);
        displayById = { ...displayById, [params.id]: next };
      }

      if (hasPageLayoutUpdate && page_layout) {
        const next = await repos.settings.patchKbPageLayout(
          params.id,
          normalizeKbPageLayoutSettings(page_layout, undefined, {
            append_missing_faqs: true,
          })
        );
        pageLayoutById = { ...pageLayoutById, [params.id]: next };
      }

      if (hasChunkingUpdate) {
        const next = await repos.settings.patchKbChunking(
          params.id,
          chunking ?? null
        );
        const { [params.id]: _dropped, ...rest } = chunkingById;
        chunkingById = next ? { ...rest, [params.id]: next } : rest;
      }

      /* Only call kb.update if there are table fields to write. */
      const hasKbUpdate = Object.keys(kbBody).length > 0;
      const kb = hasKbUpdate
        ? await repos.kb.update(params.id, kbBody)
        : before;

      if (!kb) {
        return notFound();
      }
      if (kbBody.space_id && kbBody.space_id !== before.space_id) {
        await emitKbSpaceChanged(events, repos, kb);
        logger.info("KB moved to another space", {
          from: before.space_id,
          id: kb.id,
          to: kb.space_id,
        });
      }
      return enrichKbFromSettings(
        kb,
        displayById[params.id],
        pageLayoutById[params.id],
        chunkingById[params.id]
      );
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/knowledge-bases/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      // The library's articles go with it — through the repo, so each one
      // emits `article.deleted` and leaves the search index (a soft-deleted
      // KB alone would keep its articles findable by everyone in the tenant).
      const nodes = await repos.articles.listAllForGraph(params.id);
      for (const node of nodes) {
        await repos.articles.delete(String(node.id));
      }
      await repos.kb.delete(params.id);
      logger.info("KB deleted", { articles: nodes.length, id: params.id });
      return null;
    },
  });

  /**
   * Mint the object key for a browser-direct KB upload.
   *
   * The browser used to build this key itself, which is how KB bytes ended up
   * rooted above the space boundary and stayed there after the row learned
   * about spaces: the layout lived in a UI helper nobody thought of as storage
   * code. The server owns it now — one `kbStorageKey` call, from the KB record
   * that carries the space. The browser receives a key and never composes one.
   *
   * The caller still exchanges this key for a signed URL at
   * `/api/file-storage/files/signed-upload-url`, which is where tenant scoping
   * is enforced; this route decides WHERE within the tenant, not whether.
   */
  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/upload-key",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const body = kbUploadKeySchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const kb = await repos.kb.getById(body.kb_id);
      if (!kb) {
        return notFound("Knowledge base not found");
      }
      const safeName =
        body.filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
      const stamped = `${Date.now()}_${safeName}`;
      const sub = body.sub_path?.replace(/^\/+|\/+$/g, "");
      return {
        key: sub ? kbStorageKey(kb, sub, stamped) : kbStorageKey(kb, stamped),
      };
    },
  });
}
