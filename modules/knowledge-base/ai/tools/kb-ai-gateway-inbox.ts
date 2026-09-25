import { resolveChatModelId } from "@engenty/ai-core";
import type { PluginEventsApi } from "@engenty/plugin-sdk";
import { ingestUrlToMarkdown } from "@engenty/web-ingest";
import { z } from "zod";
import { executeInboxPromote } from "../../src/api/kb-inbox-promote.js";
import { executeInboxPromoteBatch } from "../../src/api/kb-inbox-promote-batch.js";
import { inboxItemCreateSchema } from "../../src/schema/inbox.js";
import {
  kbInboxDeleteInputSchema,
  kbInboxFetchSourceInputSchema,
  kbInboxGetInputSchema,
  kbInboxPromoteBatchInputSchema,
  kbInboxPromoteInputSchema,
  kbInboxUpdateInputSchema,
} from "./kb-ai-gateway-schemas.js";
import {
  KB_SPACE_OWNED_COLLECTION,
  type KbGatewayServer,
  type KbGetRepo,
  kbDestructiveOp,
  kbGatewayOp,
  kbSpaceOwnedRecord,
} from "./kb-ai-gateway-shared.js";

export function registerKbAiGatewayInboxMethods(
  server: KbGatewayServer,
  getRepo: KbGetRepo,
  events: PluginEventsApi
): void {
  server.registerOperation({
    operationId: "kb_inbox_get",
    summary: "Get a KB inbox capture row by id",
    description:
      "Fetch one Knowledge Base inbox/source capture row by inbox_id. Use for inspecting a captured source item before triage, promotion, or update.",
    ...kbGatewayOp(true, kbSpaceOwnedRecord("inbox_id")),
    inputSchema: kbInboxGetInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id } = kbInboxGetInputSchema.parse(input ?? {});
      const item = await repos.inbox.getById(inbox_id);
      if (!item) {
        return { error: "Inbox item not found" };
      }
      return { item };
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_create",
    summary:
      "Create a KB inbox capture row (same contract as POST /api/kb/inbox)",
    description:
      "Create a Knowledge Base inbox/source capture row from raw text, markdown, URL metadata, or uploaded-source metadata in current_space. This writes data and is not for read-only discovery.",
    ...kbGatewayOp(false, KB_SPACE_OWNED_COLLECTION),
    inputSchema: inboxItemCreateSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const body = inboxItemCreateSchema.parse(input ?? {});
      const principal = ctx.auth?.principalId ?? null;
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
        principal
      );
      await repos.activity_log.append({
        kb_id: body.kb_id,
        event_type: "inbox.capture",
        payload: { inbox_id: item.id, source_type: item.source_type },
        actor_id: principal,
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
          actorId: principal ?? undefined,
          sourceModuleId: "knowledge-base",
        }
      );
      return { inbox_id: item.id, title: item.title };
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_update",
    summary: "Patch a KB inbox row (triage fields, status, raw text)",
    description:
      "Patch triage fields, status, raw text, or metadata on an existing Knowledge Base inbox/source capture row. Use only when the user wants to modify a captured source.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("inbox_id")),
    inputSchema: kbInboxUpdateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id, patch } = kbInboxUpdateInputSchema.parse(input ?? {});
      const updated = await repos.inbox.update(inbox_id, patch);
      if (!updated) {
        return { error: "Inbox item not found" };
      }
      return { item: updated };
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_promote",
    summary: "Promote an inbox capture item to article/FAQ",
    description:
      "Promote triage markdown or question text from inbox to a KB article or FAQ.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("inbox_id")),
    inputSchema: kbInboxPromoteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id, body } = kbInboxPromoteInputSchema.parse(input ?? {});
      const inboxItem = await repos.inbox.getById(inbox_id);
      if (!inboxItem) {
        return { error: "Inbox item not found" };
      }
      const res = await executeInboxPromote(repos, {
        actorPrincipalId: ctx.auth?.principalId ?? "",
        body,
        inboxItem,
      });
      return res;
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_promote_batch",
    summary: "Promote an inbox item into multiple nested articles",
    description:
      "Create multiple articles structured hierarchy-wise from a single inbox row.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("inbox_id")),
    inputSchema: kbInboxPromoteBatchInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id, body } = kbInboxPromoteBatchInputSchema.parse(
        input ?? {}
      );
      const inboxItem = await repos.inbox.getById(inbox_id);
      if (!inboxItem) {
        return { error: "Inbox item not found" };
      }
      const res = await executeInboxPromoteBatch(repos, {
        actorPrincipalId: ctx.auth?.principalId ?? "",
        body,
        inboxItem,
      });
      return res;
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_delete",
    summary: "Delete an inbox capture item",
    description: "Remove an item from the KB inbox completely.",
    ...kbDestructiveOp(kbSpaceOwnedRecord("inbox_id")),
    inputSchema: kbInboxDeleteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id } = kbInboxDeleteInputSchema.parse(input ?? {});
      const ok = await repos.inbox.delete(inbox_id);
      return { success: ok };
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_fetch_source",
    summary: "Ingest content from inbox source URL",
    description:
      "Trigger remote download of source URL markdown and store it inside inbox body.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("inbox_id")),
    inputSchema: kbInboxFetchSourceInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id, body } = kbInboxFetchSourceInputSchema.parse(
        input ?? {}
      );

      const existing = await repos.inbox.getById(inbox_id);
      if (!existing) {
        return { error: "Inbox item not found" };
      }
      if (existing.status === "promoted" || existing.status === "discarded") {
        return { error: "Inbox item cannot be fetched in this status" };
      }
      const sourceUrl = existing.source_url?.trim();
      if (!sourceUrl) {
        return { error: "source_url is required to fetch" };
      }
      const hasRaw =
        Boolean(existing.raw_markdown?.trim()) ||
        Boolean(existing.raw_text?.trim());
      if (hasRaw && !body?.force) {
        return {
          error: "Raw content already present; send force=true to replace",
        };
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
        const item = await repos.inbox.update(inbox_id, {
          raw_markdown: result.markdown,
          metadata: mergedMeta,
        });
        if (!item) {
          return { error: "Inbox item not found after update" };
        }
        await repos.activity_log.append({
          kb_id: existing.kb_id,
          event_type: "inbox.fetch_source",
          payload: {
            inbox_id,
            bytes_read: result.bytes_read,
            content_type: result.content_type,
            final_url: result.final_url,
            provider: result.provider,
          },
          actor_id: ctx.auth?.principalId ?? null,
        });
        return { item };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Fetch failed";
        ctx.logger.error("Inbox fetch-source failed", { error: msg });
        const mergedMeta = {
          ...baseMeta,
          last_fetch_error: msg,
        };
        await repos.inbox.update(inbox_id, {
          metadata: mergedMeta,
        });
        return { error: msg };
      }
    },
  });
}
