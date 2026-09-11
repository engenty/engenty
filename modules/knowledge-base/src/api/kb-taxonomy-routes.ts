import { createLogger } from "@engenty/telemetry";
import { onlyRequestedKeys } from "../schema/only-requested-keys.js";
import type { KbCategoryUpdateInput } from "../schema/types.js";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  kbArticleTemplateCreateSchema,
  kbArticleTemplateUpdateSchema,
  tagCreateSchema,
} from "../schema/zod.js";
import type { GetKbRepo, KbServerApi } from "./kb-api-shared.js";
import {
  badRequest,
  created,
  jsonError,
  notFound,
  qp,
  readRouteJsonBody,
} from "./kb-api-shared.js";

const logger = createLogger({ name: "kb-api" });

export function registerKbTaxonomyRoutes(api: KbServerApi, getRepo: GetKbRepo) {
  /* ── Tags CRUD ── */

  /* ── Article templates CRUD ── */

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/templates",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const kbId = qp(ctx).get("kb_id");
      if (!kbId) {
        return badRequest("kb_id required");
      }
      return repos.templates.list(kbId);
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/templates",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const parsed = kbArticleTemplateCreateSchema.safeParse(
        await readRouteJsonBody(ctx)
      );
      if (!parsed.success) {
        return jsonError(400, "invalid_body", parsed.error.message);
      }
      const body = parsed.data;
      try {
        const template = await repos.templates.create({
          ...body,
          description: body.description ?? null,
          content_json: body.content_json ?? null,
          content_markdown: body.content_markdown ?? null,
        });
        return created(template);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Template create failed";
        logger.error("KB template create failed", {
          kb_id: body.kb_id,
          message,
        });
        return jsonError(500, "template_create_failed", message);
      }
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/templates/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      if (!params.id?.trim()) {
        return badRequest("template id required");
      }
      const template = await repos.templates.getById(params.id);
      if (!template) {
        return notFound();
      }
      return template;
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/kb/templates/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      if (!params.id?.trim()) {
        return badRequest("template id required");
      }
      const parsed = kbArticleTemplateUpdateSchema.safeParse(
        await readRouteJsonBody(ctx)
      );
      if (!parsed.success) {
        return jsonError(400, "invalid_body", parsed.error.message);
      }
      try {
        const template = await repos.templates.update(params.id, parsed.data);
        if (!template) {
          return notFound("Template not found");
        }
        return template;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Template update failed";
        logger.error("KB template update failed", {
          id: params.id,
          message,
        });
        return jsonError(500, "template_update_failed", message);
      }
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/templates/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      await repos.templates.delete(params.id);
      return null;
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/tags",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const kbId = qp(ctx).get("kb_id");
      if (!kbId) {
        return badRequest("kb_id required");
      }
      const data = await repos.tags.list(kbId);
      return data;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/tags",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const body = tagCreateSchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const tag = await repos.tags.create({
        ...body,
        color: body.color ?? null,
      });
      return created(tag);
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/tags/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      await repos.tags.delete(params.id);
      return null;
    },
  });

  /* ── Categories CRUD ── */

  // Folder layer above articles. Every KB owns a seeded `general` row
  // (see `kb_seed_default_category` trigger / categories migration).
  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/categories",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const kbId = qp(ctx).get("kb_id");
      if (!kbId) {
        return badRequest("kb_id required");
      }
      const data = await repos.categories.list(kbId);
      return data;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/categories",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const body = categoryCreateSchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      try {
        const category = await repos.categories.create({
          kb_id: body.kb_id,
          name: body.name,
          slug: body.slug,
          description: body.description ?? null,
          parent_id: body.parent_id ?? null,
          sort_order: body.sort_order ?? 0,
          view_type: body.view_type,
          comments_mode: body.comments_mode,
          template_mode: body.template_mode,
          template_id: body.template_id,
          page_settings: body.page_settings,
        });
        return created(category);
      } catch (e) {
        return badRequest(e instanceof Error ? e.message : "Invalid category");
      }
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/categories/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const category = await repos.categories.getById(params.id);
      if (!category) {
        return notFound();
      }
      return category;
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/kb/categories/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const rawPatch = await ctx.request.json().catch(() => ({}));
      // Filter by the RAW body's keys: `.partial()` keeps `.default()` firing,
      // so the parsed patch resets sort_order on a plain rename.
      const body = onlyRequestedKeys(
        rawPatch,
        categoryUpdateSchema.parse(rawPatch) as KbCategoryUpdateInput &
          Record<string, unknown>
      ) as KbCategoryUpdateInput;
      try {
        const category = await repos.categories.update(params.id, body);
        if (!category) {
          return notFound();
        }
        return category;
      } catch (e) {
        return badRequest(e instanceof Error ? e.message : "Invalid category");
      }
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/categories/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      try {
        const ok = await repos.categories.delete(params.id);
        if (!ok) {
          return notFound();
        }
        return null;
      } catch (e) {
        return badRequest(
          e instanceof Error ? e.message : "Cannot delete category"
        );
      }
    },
  });

  /* ── Graph ── */

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/graph",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const kbId = qp(ctx).get("kb_id");
      if (!kbId) {
        return badRequest("kb_id required");
      }
      const [nodes, tags, inline_links] = await Promise.all([
        repos.articles.listAllForGraph(kbId),
        repos.tags.list(kbId),
        repos.articles.listInlineLinksForGraph(kbId),
      ]);
      return { nodes, tags, inline_links };
    },
  });
}
