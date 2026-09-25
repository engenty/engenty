import { resolveChatModelId } from "@engenty/ai-core";
import { createApiError } from "@engenty/api-contracts";
import type { PluginEventsApi } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import { ingestUrlToMarkdown } from "@engenty/web-ingest";
import {
  inboxFetchSourceBodySchema,
  inboxItemCreateSchema,
  inboxItemUpdateSchema,
  inboxPromoteBatchBodySchema,
  inboxPromoteSchema,
  inboxQuerySchema,
  kbActivityLogQuerySchema,
} from "../schema/zod.js";
import type { GetKbRepo, KbServerApi } from "./kb-api-shared.js";
import { created, notFound, qp } from "./kb-api-shared.js";
import { executeInboxPromote } from "./kb-inbox-promote.js";
import { executeInboxPromoteBatch } from "./kb-inbox-promote-batch.js";

const logger = createLogger({ name: "kb-api" });

export function registerKbInboxRoutes(
  api: KbServerApi,
  events: PluginEventsApi,
  getRepo: GetKbRepo
) {
  /* ── Inbox (raw capture) ── */

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/inbox",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const sp = qp(ctx);
      const raw: Record<string, unknown> = {};
      for (const key of [
        "kb_id",
        "page",
        "page_size",
        "search",
        "sort_by",
        "sort_order",
        "status",
      ]) {
        const v = sp.get(key);
        if (v !== null && v !== "") {
          if (["page", "page_size"].includes(key)) {
            raw[key] = Number.parseInt(v, 10);
          } else {
            raw[key] = v;
          }
        }
      }
      const params = inboxQuerySchema.parse(raw);
      return repos.inbox.listPaginated(params);
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/inbox",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const body = inboxItemCreateSchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const item = await repos.inbox.create(
        {
          kb_id: body.kb_id,
          title: body.title,
          source_type: body.source_type,
          source_url: body.source_url ?? null,
          raw_markdown: body.raw_markdown ?? null,
          raw_text: body.raw_text ?? null,
          metadata: body.metadata ?? {},
          original_storage_path: body.original_storage_path ?? null,
        },
        ctx.auth?.principalId ?? null
      );
      await repos.activity_log.append({
        kb_id: body.kb_id,
        event_type: "inbox.capture",
        payload: { inbox_id: item.id, source_type: item.source_type },
        actor_id: ctx.auth?.principalId ?? null,
      });
      await events.modules.emit(
        "knowledge-base.inbox.item.created",
        {
          tenant_id: item.tenant_id,
          scope_id: item.scope_id,
          kb_id: item.kb_id,
          inbox_id: item.id,
          title: item.title,
          source_type: item.source_type,
        },
        {
          tenantId: item.tenant_id,
          actorId: ctx.auth?.principalId,
          sourceModuleId: "knowledge-base",
        }
      );
      return created(item);
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/inbox/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const item = await repos.inbox.getById(params.id);
      if (!item) {
        return notFound();
      }
      return item;
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/kb/inbox/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const body = inboxItemUpdateSchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const existing = await repos.inbox.getById(params.id);
      if (!existing) {
        return notFound();
      }
      let patch = { ...body };
      if (body.status === "discarded") {
        patch = {
          ...patch,
          discarded_at: new Date().toISOString(),
        };
      }
      const item = await repos.inbox.update(params.id, patch);
      if (!item) {
        return notFound();
      }
      if (body.status === "discarded") {
        await repos.activity_log.append({
          kb_id: existing.kb_id,
          event_type: "inbox.discard",
          payload: { inbox_id: params.id },
          actor_id: ctx.auth?.principalId ?? null,
        });
      }
      return item;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/inbox/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const existing = await repos.inbox.getById(params.id);
      if (!existing) {
        return notFound();
      }
      await repos.inbox.delete(params.id);
      await repos.activity_log.append({
        kb_id: existing.kb_id,
        event_type: "inbox.delete",
        payload: { inbox_id: params.id },
        actor_id: ctx.auth?.principalId ?? null,
      });
      return null;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/inbox/:id/fetch-source",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const body = inboxFetchSourceBodySchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const existing = await repos.inbox.getById(params.id);
      if (!existing) {
        return notFound();
      }
      if (existing.status === "promoted" || existing.status === "discarded") {
        return new Response(
          JSON.stringify(
            createApiError({
              code: "inbox_not_editable",
              message: "Inbox item cannot be fetched in this status",
            })
          ),
          { status: 409, headers: { "content-type": "application/json" } }
        );
      }
      const sourceUrl = existing.source_url?.trim();
      if (!sourceUrl) {
        return new Response(
          JSON.stringify(
            createApiError({
              code: "source_url_required",
              message: "source_url is required to fetch",
            })
          ),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      const hasRaw =
        Boolean(existing.raw_markdown?.trim()) ||
        Boolean(existing.raw_text?.trim());
      if (hasRaw && !body.force) {
        return new Response(
          JSON.stringify(
            createApiError({
              code: "inbox_raw_exists",
              message:
                'Raw content already present; send { "force": true } to replace',
            })
          ),
          { status: 409, headers: { "content-type": "application/json" } }
        );
      }

      const now = new Date().toISOString();
      const baseMeta = {
        ...existing.metadata,
        last_fetch_at: now,
      };

      try {
        const result = await ingestUrlToMarkdown(sourceUrl, {
          fetchUserAgent: `EngentyKnowledgeBase/1.0 (+${process.env.ENGENTY_UI_BASE_URL?.trim() || "engenty"}; inbox URL fetch)`,
          firecrawlApiKey: process.env.FIRECRAWL_API_KEY?.trim() || undefined,
          llmModel: resolveChatModelId({ purpose: "fast_text" }),
        });
        const mergedMeta = {
          ...baseMeta,
          last_fetch_content_type: result.content_type,
          last_fetch_bytes: result.bytes_read,
          last_fetch_final_url: result.final_url,
          last_fetch_provider: result.provider,
          last_fetch_error: null,
        };
        const item = await repos.inbox.update(params.id, {
          raw_markdown: result.markdown,
          metadata: mergedMeta,
        });
        if (!item) {
          return notFound();
        }
        await repos.activity_log.append({
          kb_id: existing.kb_id,
          event_type: "inbox.fetch_source",
          payload: {
            inbox_id: params.id,
            bytes_read: result.bytes_read,
            content_type: result.content_type,
            final_url: result.final_url,
            provider: result.provider,
          },
          actor_id: ctx.auth?.principalId ?? null,
        });
        return item;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Fetch failed";
        logger.error("Inbox fetch-source failed", { error: msg });
        const mergedMeta = {
          ...baseMeta,
          last_fetch_error: msg,
        };
        await repos.inbox.update(params.id, {
          metadata: mergedMeta,
        });
        return new Response(
          JSON.stringify(
            createApiError({
              code: "fetch_failed",
              message: msg,
            })
          ),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/inbox/:id/promote",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const body = inboxPromoteSchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const inboxItem = await repos.inbox.getById(params.id);
      if (!inboxItem) {
        return notFound();
      }
      if (inboxItem.status === "promoted") {
        return new Response(
          JSON.stringify({ ok: false, error: "Inbox item already promoted" }),
          { status: 409, headers: { "content-type": "application/json" } }
        );
      }
      const principalId = ctx.auth?.principalId ?? "system";
      try {
        const result = await executeInboxPromote(repos, {
          actorPrincipalId: principalId,
          body,
          inboxItem,
        });
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Promote failed";
        logger.error("Inbox promote failed", { error: msg });
        return new Response(JSON.stringify({ ok: false, error: msg }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/inbox/:id/promote-batch",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const body = inboxPromoteBatchBodySchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const inboxItem = await repos.inbox.getById(params.id);
      if (!inboxItem) {
        return notFound();
      }
      if (inboxItem.status === "promoted") {
        return new Response(
          JSON.stringify({ ok: false, error: "Inbox item already promoted" }),
          { status: 409, headers: { "content-type": "application/json" } }
        );
      }
      const principalId = ctx.auth?.principalId ?? "system";
      try {
        const result = await executeInboxPromoteBatch(repos, {
          actorPrincipalId: principalId,
          body,
          inboxItem,
        });
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Promote batch failed";
        logger.error("Inbox promote-batch failed", { error: msg });
        return new Response(JSON.stringify({ ok: false, error: msg }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/activity-log",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const sp = qp(ctx);
      const raw: Record<string, unknown> = {};
      for (const key of ["kb_id", "page", "page_size"]) {
        const v = sp.get(key);
        if (v !== null && v !== "") {
          if (["page", "page_size"].includes(key)) {
            raw[key] = Number.parseInt(v, 10);
          } else {
            raw[key] = v;
          }
        }
      }
      const q = kbActivityLogQuerySchema.parse(raw);
      return repos.activity_log.listPaginated(q);
    },
  });
}
