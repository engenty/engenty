/**
 * Knowledge Base — Backend plugin entry.
 */

import {
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
  type EntityEventPayload,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { knowledgeBaseAiRegistration } from "../ai/registrar.js";
import { registerKbApi } from "./api/index.js";
import type {
  EmitArticleEvent,
  EmitCategoryEvent,
  EmitKbEvent,
} from "./dal/contracts.js";
import {
  createKbArticlesSearchIndexProvider,
  type KbArticlesSearchProvider,
} from "./dal/kb-articles-search-index-provider.js";
import { createKbRepoFactory } from "./dal/supabase.js";
import { kbArticlesSearchFiltersSchema } from "./schema/zod.js";
import {
  registerKbContextGraph,
  registerKbGraphRagSearchOperation,
} from "./services/kb-graph-rag.js";

// `knowledge-base.article.{created,updated,deleted}` payload contract.
// `kb_id` rides along for telemetry / future filtering — the search index
// re-index path only needs `article_id` + `tenant_id`.
type ArticleEntityPayload = EntityEventPayload<"article_id"> & {
  kb_id?: string;
};

// `knowledge-base.category.{created,updated,deleted}` — folder-tree changes.
type CategoryEntityPayload = EntityEventPayload<"category_id"> & {
  kb_id: string;
};

// `knowledge-base.kb.{created,updated,deleted}` — KB configuration changes.
type KbEntityPayload = EntityEventPayload<"kb_id">;

const registerKnowledgeBasePlugin: EngentyPluginFactory = async (engenty) => {
  const { events, server } = engenty;
  const supabaseRaw = server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error(
      "Knowledge Base module requires Supabase (supabaseUrl and supabaseServiceRoleKey)"
    );
  }
  // Core injects the supabase service-role client. The plugin SDK contract
  // is adapter-agnostic (`unknown`); KB is intentionally Supabase-bound.
  const supabase = supabaseRaw as SupabaseClient;

  const emitArticleEvent: EmitArticleEvent = async (verb, payload) => {
    await events.modules.emit<ArticleEntityPayload>(
      `knowledge-base.article.${verb}` as const,
      {
        article_id: payload.article_id,
        kb_id: payload.kb_id,
        scope_id: payload.scope_id,
        tenant_id: payload.tenant_id,
      } satisfies ArticleEntityPayload,
      { tenantId: payload.tenant_id }
    );
  };

  const emitCategoryEvent: EmitCategoryEvent = async (verb, payload) => {
    await events.modules.emit<CategoryEntityPayload>(
      `knowledge-base.category.${verb}` as const,
      {
        category_id: payload.category_id,
        kb_id: payload.kb_id,
        scope_id: payload.scope_id,
        tenant_id: payload.tenant_id,
      } satisfies CategoryEntityPayload,
      { tenantId: payload.tenant_id }
    );
  };

  const emitKbEvent: EmitKbEvent = async (verb, payload) => {
    await events.modules.emit<KbEntityPayload>(
      `knowledge-base.kb.${verb}` as const,
      {
        kb_id: payload.kb_id,
        scope_id: payload.scope_id,
        tenant_id: payload.tenant_id,
      } satisfies KbEntityPayload,
      { tenantId: payload.tenant_id }
    );
  };

  // Per-tenant repo factory shared by HTTP routes, gateway operations, and
  // the search provider's verifier / multi-KB fan-out paths.
  const repoFactory = (tenantId: string, scopeId: string) =>
    createKbRepoFactory(supabase, tenantId, scopeId, {
      emitArticleEvent,
      emitCategoryEvent,
      emitKbEvent,
    });

  const searchProvider: KbArticlesSearchProvider =
    createKbArticlesSearchIndexProvider({
      supabase,
      resolveRepos: (tenantId, scopeId) => {
        const repos = repoFactory(tenantId, scopeId);
        return {
          articles: repos.articles,
          kb: repos.kb,
          settings: repos.settings,
        };
      },
    });

  // Auto-tool `knowledge_base_article_search`, declarative re-index from
  // `knowledge-base.article.{created,updated,deleted}`, and admin
  // status/backfill at `/api/search-index/providers/kb.article/*`.
  server.registerSearchIndexProvider(searchProvider, {
    capabilities: searchProvider.capabilities,
    entityName: "article",
    filtersSchema: kbArticlesSearchFiltersSchema,
    moduleId: "knowledge-base",
    onEvents: [
      {
        action: "replace",
        docId: (p) => (p as ArticleEntityPayload).article_id ?? null,
        name: "knowledge-base.article.created",
      },
      {
        action: "replace",
        docId: (p) => (p as ArticleEntityPayload).article_id ?? null,
        name: "knowledge-base.article.updated",
      },
      {
        action: "delete",
        docId: (p) => (p as ArticleEntityPayload).article_id ?? null,
        name: "knowledge-base.article.deleted",
      },
    ],
    operationOverrides: {
      idempotent: true,
      requiredCapabilities: ["module.knowledge-base.read"],
      riskLevel: "low",
      summary:
        'Search Knowledge Base articles (omit kb_id to fan out across every accessible KB). Use strategy: "lexical" for cheap BM25/FTS-only suggest.',
    },
  });

  registerKbApi(server, events, repoFactory, searchProvider);

  // Register Context Graph schemas and sources for GraphRAG context enrichment
  registerKbContextGraph({ server, supabase });
  registerKbGraphRagSearchOperation(server, repoFactory);

  const { invokeOperation } = createPluginServerGatewayCaller(server);

  server.registerAiRegistration(
    knowledgeBaseAiRegistration({ invokeKbOperation: invokeOperation })
  );
};

export default registerKnowledgeBasePlugin;
