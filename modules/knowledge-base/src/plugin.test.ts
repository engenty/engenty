import type {
  EngentyPluginApi,
  PluginAiRegistration,
  PluginEventsApi,
  PluginHttpRoute,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import registerKnowledgeBasePlugin from "./plugin.js";

function makePluginApi() {
  const aiRegistrations: PluginAiRegistration[] = [];
  const httpRoutes: PluginHttpRoute[] = [];
  const operations: PluginServerOperation[] = [];

  const engenty = {
    events: {
      modules: {
        emit: async () => {},
        on: () => ({ dispose: async () => {} }),
      },
      core: {
        emit: async () => {},
      },
    } as unknown as PluginEventsApi,
    server: {
      callGatewayMethod: async () => null,
      getDatabaseAdapter: () => ({}) as unknown,
      getStorageService: () => null,
      hasOperation: () => false,
      registerAiRegistration: (registration: PluginAiRegistration) => {
        aiRegistrations.push(registration);
      },
      registerHttpRoute: (route: PluginHttpRoute) => {
        httpRoutes.push(route);
      },
      registerOperation: (operation: PluginServerOperation) => {
        operations.push(operation);
        return { dispose: async () => {} };
      },
      registerSearchIndexProvider: (
        _provider: unknown,
        opts: { entityName?: string; moduleId?: string }
      ) => {
        const operationId = `${opts.moduleId}_${opts.entityName}_search`
          .replace(/[^a-zA-Z0-9_]+/g, "_")
          .replace(/^_+|_+$/g, "");
        operations.push({
          operationId,
          summary: "synthesized",
          handler: async () => ({}),
        } as unknown as PluginServerOperation);
        return { dispose: async () => {} };
      },
      registerTestDataType: () => {},
    },
  } as unknown as EngentyPluginApi;

  return { aiRegistrations, engenty, httpRoutes, operations };
}

describe("registerKnowledgeBasePlugin", () => {
  it("registers the synthesized knowledge-base.article.search op (replaces bespoke kb.search)", async () => {
    const { aiRegistrations, engenty, httpRoutes, operations } =
      makePluginApi();

    await registerKnowledgeBasePlugin(engenty);

    expect(aiRegistrations).toHaveLength(1);
    const routeIds = httpRoutes.map(
      (route) => `${route.method.toUpperCase()} ${route.path}`
    );

    expect(routeIds.toSorted()).toEqual(
      [
        "DELETE /api/kb/article-comments/:commentId",
        "DELETE /api/kb/articles/:id",
        "DELETE /api/kb/attachments/:id",
        "DELETE /api/kb/categories/:id",
        "DELETE /api/kb/faqs/:id",
        "DELETE /api/kb/inbox/:id",
        "DELETE /api/kb/knowledge-bases/:id",
        "DELETE /api/kb/sources/:id",
        "DELETE /api/kb/sources/:id/runs",
        "DELETE /api/kb/sources/:sourceId/items/:itemId",
        "DELETE /api/kb/tags/:id",
        "DELETE /api/kb/templates/:id",
        "GET /api/kb/activity-log",
        "GET /api/kb/articles",
        "GET /api/kb/articles/:articleId/attachments",
        "GET /api/kb/articles/:id",
        "GET /api/kb/articles/:id/comments",
        "GET /api/kb/articles/:id/export.pdf",
        "GET /api/kb/articles/:id/versions",
        "GET /api/kb/articles/:id/versions/:version",
        "GET /api/kb/articles/comment-counts",
        "GET /api/kb/categories",
        "GET /api/kb/categories/:id",
        "GET /api/kb/cover/unsplash/search",
        "GET /api/kb/faqs",
        "GET /api/kb/faqs/:id",
        "GET /api/kb/faqs/:id/versions",
        "GET /api/kb/faqs/:id/versions/:version",
        "GET /api/kb/graph",
        "GET /api/kb/inbox",
        "GET /api/kb/inbox/:id",
        "GET /api/kb/knowledge-bases",
        "GET /api/kb/knowledge-bases/:id",
        "GET /api/kb/search/suggest",
        "GET /api/kb/settings",
        "GET /api/kb/source-adapters",
        "GET /api/kb/source-items/:id",
        "GET /api/kb/sources",
        "GET /api/kb/sources/:id",
        "GET /api/kb/sources/:id/index",
        "GET /api/kb/sources/:id/items",
        "GET /api/kb/tags",
        "GET /api/kb/templates",
        "GET /api/kb/templates/:id",
        "PATCH /api/kb/inbox/:id",
        "PATCH /api/kb/sources/:id",
        "PATCH /api/kb/sources/:sourceId/items/:itemId",
        "POST /api/kb/articles",
        "POST /api/kb/articles/:id/comments",
        "POST /api/kb/articles/:id/refresh-metadata",
        "POST /api/kb/articles/:id/versions/:version/restore",
        "POST /api/kb/articles/:articleId/attachments",
        "POST /api/kb/articles/generate-summary",
        "POST /api/kb/categories",
        "POST /api/kb/chat",
        "POST /api/kb/convert-document",
        "POST /api/kb/cover/ai",
        "POST /api/kb/cover/unsplash/import",
        "POST /api/kb/faqs",
        "POST /api/kb/inbox",
        "POST /api/kb/inbox/:id/fetch-source",
        "POST /api/kb/inbox/:id/promote",
        "POST /api/kb/inbox/:id/promote-batch",
        "POST /api/kb/knowledge-bases",
        "POST /api/kb/search",
        "POST /api/kb/source-adapters/:adapterId/index",
        "POST /api/kb/source-webhooks/:token",
        "POST /api/kb/sources",
        "POST /api/kb/sources/:id/ingest",
        "POST /api/kb/sources/:id/rotate-webhook-token",
        "POST /api/kb/sources/:id/run",
        "POST /api/kb/sources/:id/runs/:runId/stop",
        "POST /api/kb/sources/run-due",
        "POST /api/kb/tags",
        "POST /api/kb/templates",
        "PUT /api/kb/article-comments/:commentId",
        "PUT /api/kb/articles/:id",
        "PUT /api/kb/categories/:id",
        "PUT /api/kb/faqs/:id",
        "PUT /api/kb/knowledge-bases/:id",
        "PUT /api/kb/settings",
        "PUT /api/kb/templates/:id",
      ].toSorted()
    );

    const commentCountsIndex = routeIds.indexOf(
      "GET /api/kb/articles/comment-counts"
    );
    const byIdIndex = routeIds.indexOf("GET /api/kb/articles/:id");
    expect(commentCountsIndex).toBeGreaterThanOrEqual(0);
    expect(byIdIndex).toBeGreaterThan(commentCountsIndex);

    const opIds = operations.map((operation) => operation.operationId);
    expect(opIds).toContain("knowledge_base_article_search");
    expect(opIds).not.toContain("kb_search");
  });
});
