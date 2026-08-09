/**
 * Single-turn KB Q&A using tool-grounded generateText (AI Gateway).
 */

import {
  parseTenantAiSettings,
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
  TENANT_AI_CONFIG_KEY,
} from "@engenty/ai-core";
import type {
  PluginHttpRouteContext,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import type { KbRepoFactoryFn } from "../dal/contracts.js";
import type { KbArticlesSearchProvider } from "../dal/kb-retrieval-source.js";
import type { GetKbDb } from "./kb-api-shared.js";

const kbChatBodySchema = z.object({
  kb_id: z.string().min(1),
  message: z.string().min(1).max(16_000),
});

function badRequest(msg: string) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export function registerKbChatRoute(
  api: Pick<PluginServerApi, "registerHttpRoute">,
  repoFactory: KbRepoFactoryFn,
  searchProvider: KbArticlesSearchProvider,
  /** Tenant-locked handle factory — the settings read runs as the caller's tenant. */
  getDb: GetKbDb
) {
  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/chat",
    handler: async (ctx: PluginHttpRouteContext) => {
      const auth = ctx.auth;
      if (!auth) {
        return new Response(
          JSON.stringify({ ok: false, error: "Auth required" }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          }
        );
      }

      const parsed = kbChatBodySchema.safeParse(
        await ctx.request.json().catch(() => ({}))
      );
      if (!parsed.success) {
        return badRequest("kb_id and message required");
      }
      const { kb_id: kbId, message } = parsed.data;

      if (!readAiGatewayApiKeyFromEnv()) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "AI Gateway is not configured (AI_GATEWAY_API_KEY).",
          }),
          { status: 503, headers: { "content-type": "application/json" } }
        );
      }

      let tenantModelId: string | undefined;
      try {
        const repo = createTenantSettingsRepoSupabase(
          getDb(auth),
          auth.tenantId,
          auth.scopeId
        );
        const row = await repo.get(TENANT_AI_CONFIG_KEY);
        const tenantAi = parseTenantAiSettings(row?.value);
        tenantModelId = tenantAi.chat_model_id ?? undefined;
      } catch {
        /* use default */
      }

      const modelId = resolveChatModelId({
        purpose: "chat",
        tenantDefault: tenantModelId,
      });

      const repos = repoFactory(auth.tenantId, auth.scopeId);

      const tools = {
        search_kb: tool({
          description:
            "Search the knowledge base for relevant article excerpts (semantic / vector).",
          inputSchema: z.object({
            query: z.string(),
            limit: z.number().int().min(1).max(15).optional(),
          }),
          execute: async ({ query, limit }) => {
            const response = await searchProvider.search({
              query,
              limit: limit ?? 6,
              filters: {
                kb_id: kbId,
                tenant_id: auth.tenantId,
                scope_id: auth.scopeId,
              },
            });
            const results = response.results.map((r) => ({
              article_id: r.item.article_id,
              title: r.item.title,
              chunk_text: r.item.chunk_text,
              score: r.score,
            }));
            return { results };
          },
        }),
        get_article: tool({
          description: "Load full article content by ID when you need details.",
          inputSchema: z.object({ article_id: z.string() }),
          execute: async ({ article_id }) => {
            const article = await repos.articles.getById(article_id);
            if (!article) {
              return { error: "Article not found" };
            }
            return {
              article: {
                id: article.id,
                title: article.title,
                summary: article.summary,
                content_markdown: article.content_markdown,
                status: article.status,
              },
            };
          },
        }),
        list_faqs: tool({
          description: "List FAQs that may answer common questions.",
          inputSchema: z.object({
            search: z.string().optional(),
            page_size: z.number().int().min(1).max(20).optional(),
          }),
          execute: async ({ search, page_size }) => {
            const result = await repos.faqs.listPaginated({
              kb_id: kbId,
              search,
              page_size: page_size ?? 10,
            });
            return {
              faqs: result.data.map((f) => ({
                id: f.id,
                question: f.question,
                answer_markdown: f.answer_markdown,
              })),
            };
          },
        }),
      };

      const result = await generateText({
        model: modelId,
        instructions: [
          "You are a concise knowledge base assistant.",
          "You must answer using tool results only for factual claims about the KB.",
          `The active knowledge base id is: ${kbId}.`,
          "Cite article titles when relevant. If tools return nothing useful, say you could not find that in the knowledge base.",
        ].join("\n"),
        tools,
        prompt: message,
        stopWhen: isStepCount(8),
      });

      return Response.json({
        ok: true,
        text: result.text,
      });
    },
  });
}
