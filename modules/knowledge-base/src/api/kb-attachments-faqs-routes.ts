import { createLogger } from "@engenty/telemetry";
import { onlyRequestedKeys } from "../schema/only-requested-keys.js";
import {
  attachmentCreateSchema,
  faqCreateSchema,
  faqsQuerySchema,
  faqUpdateSchema,
} from "../schema/zod.js";
import type { GetKbRepo, KbServerApi } from "./kb-api-shared.js";
import {
  badRequest,
  created,
  notFound,
  parseBody,
  qp,
} from "./kb-api-shared.js";

const logger = createLogger({ name: "kb-api" });

export function registerKbAttachmentAndFaqRoutes(
  api: KbServerApi,
  getRepo: GetKbRepo
) {
  /* ── Attachments ── */

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/articles/:articleId/attachments",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { articleId: string };
      const article = await repos.articles.getById(params.articleId);
      if (!article) {
        return notFound();
      }
      const data = await repos.attachments.listByArticle(article.id);
      return data;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/articles/:articleId/attachments",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { articleId: string };
      const article = await repos.articles.getById(params.articleId);
      if (!article) {
        return notFound();
      }
      const body = attachmentCreateSchema.parse({
        ...parseBody(await ctx.request.json().catch(() => ({}))),
        article_id: article.id,
      });
      const att = await repos.attachments.create(body);
      return created(att);
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/attachments/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      await repos.attachments.delete(params.id);
      return null;
    },
  });

  /* ── FAQs CRUD ── */

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/faqs",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const sp = qp(ctx);
      const raw: Record<string, unknown> = {};
      for (const key of [
        "kb_id",
        "status",
        "search",
        "page",
        "page_size",
        "sort_by",
        "sort_order",
      ]) {
        const v = sp.get(key);
        if (v !== null) {
          if (["page", "page_size"].includes(key)) {
            raw[key] = Number.parseInt(v, 10);
          } else {
            raw[key] = v;
          }
        }
      }
      const faqParams = faqsQuerySchema.parse(raw);
      const result = await repos.faqs.listPaginated(faqParams);
      return result;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/faqs",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const { tag_ids, ...rest } = faqCreateSchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const faq = await repos.faqs.create(
        {
          ...rest,
          answer_json: rest.answer_json ?? null,
          answer_markdown: rest.answer_markdown ?? null,
        },
        tag_ids,
        ctx.auth ? { principalId: ctx.auth.principalId } : null
      );
      logger.info("FAQ created", { id: faq.id });
      return created(faq);
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/faqs/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const faq = await repos.faqs.getById(params.id);
      if (!faq) {
        return notFound();
      }
      return faq;
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/faqs/:id/versions",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const faq = await repos.faqs.getById(params.id);
      if (!faq) {
        return notFound();
      }
      const items = await repos.versions.listFaqVersions(params.id);
      return { data: items };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/faqs/:id/versions/:version",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string; version: string };
      const faq = await repos.faqs.getById(params.id);
      if (!faq) {
        return notFound();
      }
      const version = Number.parseInt(params.version, 10);
      if (!Number.isFinite(version) || version < 1) {
        return badRequest("Invalid version");
      }
      const row = await repos.versions.getFaqVersion(params.id, version);
      if (!row) {
        return notFound();
      }
      return row;
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/kb/faqs/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const rawPatch = await ctx.request.json().catch(() => ({}));
      // Filter by the RAW body's keys: `.partial()` keeps `.default()` firing,
      // so the parsed patch invents status/sort_order for a plain rename.
      const { tag_ids, ...rest } = onlyRequestedKeys(
        rawPatch,
        faqUpdateSchema.parse(rawPatch)
      );
      const faq = await repos.faqs.update(
        params.id,
        rest,
        tag_ids,
        ctx.auth ? { principalId: ctx.auth.principalId } : null
      );
      if (!faq) {
        return notFound();
      }
      return faq;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/faqs/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      await repos.faqs.delete(params.id);
      return null;
    },
  });
}
