import { createLogger } from "@engenty/telemetry";
import { enrichKbFromSettings } from "../dal/shared.js";
import { normalizeKbPageLayoutSettings } from "../schema/page-blocks.js";
import type { KbDisplay, KbSettings } from "../schema/types.js";
import {
  knowledgeBaseCreateSchema,
  knowledgeBaseUpdateSchema,
} from "../schema/zod.js";
import type { GetKbRepo, KbServerApi } from "./kb-api-shared.js";
import { notFound } from "./kb-api-shared.js";

const logger = createLogger({ name: "kb-api" });

export function registerKbKnowledgeBaseRoutes(
  api: KbServerApi,
  getRepo: GetKbRepo
) {
  /* ── Knowledge Bases CRUD ── */

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/knowledge-bases",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const [kbs, settings] = await Promise.all([
        repos.kb.list(),
        repos.settings.get(),
      ]);
      return kbs.map((kb) =>
        enrichKbFromSettings(
          kb,
          settings.kb_display_by_id[kb.id],
          settings.kb_page_layout_by_id[kb.id]
        )
      );
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/knowledge-bases",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const body = knowledgeBaseCreateSchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const kb = await repos.kb.create({
        ...body,
        description: body.description ?? null,
      });
      logger.info("KB created", { id: kb.id, name: kb.name });
      return kb;
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
      return enrichKbFromSettings(
        kb,
        settings.kb_display_by_id[params.id],
        settings.kb_page_layout_by_id[params.id]
      );
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
      const { icon, cover, page_layout, ...kbBody } = body;
      const hasDisplayUpdate = icon !== undefined || cover !== undefined;
      const hasPageLayoutUpdate = page_layout !== undefined;

      let displayById: KbSettings["kb_display_by_id"] = {};
      let pageLayoutById: KbSettings["kb_page_layout_by_id"] = {};

      const settings = await repos.settings.get();
      displayById = settings.kb_display_by_id;
      pageLayoutById = settings.kb_page_layout_by_id;

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

      /* Only call kb.update if there are table fields to write. */
      const hasKbUpdate = Object.keys(kbBody).length > 0;
      const kb = hasKbUpdate
        ? await repos.kb.update(params.id, kbBody)
        : await repos.kb.getById(params.id);

      if (!kb) {
        return notFound();
      }
      return enrichKbFromSettings(
        kb,
        displayById[params.id],
        pageLayoutById[params.id]
      );
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/knowledge-bases/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      await repos.kb.delete(params.id);
      return null;
    },
  });
}
