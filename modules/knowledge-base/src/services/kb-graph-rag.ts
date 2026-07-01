import type { PluginServerApi } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const articleSchema = z
  .object({
    title: z.string().nullish(),
    slug: z.string().nullish(),
    summary: z.string().nullish(),
  })
  .loose();

const categorySchema = z
  .object({
    name: z.string().nullish(),
    slug: z.string().nullish(),
    description: z.string().nullish(),
  })
  .loose();

export function registerKbContextGraph(input: {
  server: Pick<
    PluginServerApi,
    "registerContextGraphSchema" | "registerContextGraphSource"
  >;
  supabase: SupabaseClient;
}): void {
  const { server, supabase } = input;
  if (!server.registerContextGraphSchema) {
    return;
  }

  server.registerContextGraphSchema({
    moduleId: "knowledge-base",
    entityTypes: [
      {
        id: "knowledge-base.article",
        displayName: "Article",
        attributesSchema: articleSchema,
      },
      {
        id: "knowledge-base.category",
        displayName: "Category",
        attributesSchema: categorySchema,
      },
    ],
    edgeTypes: [
      {
        id: "knowledge-base.child_of",
        displayName: "Child of",
        subjectTypes: ["knowledge-base.article"],
        objectTypes: ["knowledge-base.article"],
      },
      {
        id: "knowledge-base.category_member",
        displayName: "Category member",
        subjectTypes: ["knowledge-base.article"],
        objectTypes: ["knowledge-base.category"],
      },
      {
        id: "knowledge-base.category_child_of",
        displayName: "Category child of",
        subjectTypes: ["knowledge-base.category"],
        objectTypes: ["knowledge-base.category"],
      },
      {
        id: "knowledge-base.links_to",
        displayName: "Links to",
        subjectTypes: ["knowledge-base.article"],
        objectTypes: ["knowledge-base.article"],
      },
    ],
  });

  server.registerContextGraphSource?.({
    id: "knowledge-base",
    displayName: "Knowledge Base",
    description: "Articles and categories from the knowledge base",
    entityTypeIds: ["knowledge-base.article", "knowledge-base.category"],
    getStatus: async (api, tenantId) => {
      const [inGraphEntities, countResult] = await Promise.all([
        api.listEntities({ tenantId, module: "knowledge-base" }),
        supabase
          .schema("module_kb")
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .is("deleted_at", null),
      ]);
      return {
        inGraph: (inGraphEntities as unknown[]).length,
        inSource: countResult.count ?? 0,
      };
    },
    sync: async (api, tenantId) => {
      // 1. Fetch and upsert categories
      const { data: categoryRows, error: catErr } = await supabase
        .schema("module_kb")
        .from("categories")
        .select("id, name, slug, description, parent_category_id")
        .eq("tenant_id", tenantId);
      if (catErr) {
        throw new Error(`categories: ${catErr.message}`);
      }

      let entities = 0;
      for (const row of categoryRows ?? []) {
        await api.upsertEntity({
          tenantId,
          type: "knowledge-base.category",
          externalRef: {
            module: "knowledge-base",
            entity: "category",
            id: row.id,
          },
          name: row.name,
          attributes: {
            name: row.name,
            slug: row.slug,
            description: row.description,
          },
        });
        entities++;
      }

      // 2. Fetch and upsert articles
      const { data: articleRows, error: artErr } = await supabase
        .schema("module_kb")
        .from("articles")
        .select("id, title, slug, summary, category_id, parent_article_id")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);
      if (artErr) {
        throw new Error(`articles: ${artErr.message}`);
      }

      for (const row of articleRows ?? []) {
        await api.upsertEntity({
          tenantId,
          type: "knowledge-base.article",
          externalRef: {
            module: "knowledge-base",
            entity: "article",
            id: row.id,
          },
          name: row.title,
          attributes: {
            title: row.title,
            slug: row.slug,
            summary: row.summary,
          },
        });
        entities++;
      }

      let edges = 0;

      // 3. Category parent-child edges
      for (const row of categoryRows ?? []) {
        if (!row.parent_category_id) {
          continue;
        }
        const [subject, object] = await Promise.all([
          api.getEntity({
            tenantId,
            externalRef: {
              module: "knowledge-base",
              entity: "category",
              id: row.id,
            },
          }),
          api.getEntity({
            tenantId,
            externalRef: {
              module: "knowledge-base",
              entity: "category",
              id: row.parent_category_id,
            },
          }),
        ]);
        if (subject && object) {
          await api.upsertEdge({
            tenantId,
            type: "knowledge-base.category_child_of",
            subjectId: (subject as any).id,
            objectId: (object as any).id,
          });
          edges++;
        }
      }

      // 4. Category member & parent-child article edges
      for (const row of articleRows ?? []) {
        if (row.category_id) {
          const [subject, object] = await Promise.all([
            api.getEntity({
              tenantId,
              externalRef: {
                module: "knowledge-base",
                entity: "article",
                id: row.id,
              },
            }),
            api.getEntity({
              tenantId,
              externalRef: {
                module: "knowledge-base",
                entity: "category",
                id: row.category_id,
              },
            }),
          ]);
          if (subject && object) {
            await api.upsertEdge({
              tenantId,
              type: "knowledge-base.category_member",
              subjectId: (subject as any).id,
              objectId: (object as any).id,
            });
            edges++;
          }
        }

        if (row.parent_article_id) {
          const [subject, object] = await Promise.all([
            api.getEntity({
              tenantId,
              externalRef: {
                module: "knowledge-base",
                entity: "article",
                id: row.id,
              },
            }),
            api.getEntity({
              tenantId,
              externalRef: {
                module: "knowledge-base",
                entity: "article",
                id: row.parent_article_id,
              },
            }),
          ]);
          if (subject && object) {
            await api.upsertEdge({
              tenantId,
              type: "knowledge-base.child_of",
              subjectId: (subject as any).id,
              objectId: (object as any).id,
            });
            edges++;
          }
        }
      }

      return { entities, edges };
    },
  });
}

export function registerKbGraphRagSearchOperation(
  server: Pick<PluginServerApi, "registerOperation" | "contextGraph">,
  repoFactory: (tenantId: string, scopeId: string) => any
): void {
  server.registerOperation({
    operationId: "kb_graph_rag_search",
    summary: "GraphRAG knowledge search",
    description:
      "Perform a GraphRAG relational search over knowledge base articles and folders. Retrieves adjacent entities (parents, children, categories) linked to the search matches to provide multi-hop graph context.",
    moduleId: "knowledge-base",
    riskLevel: "low",
    idempotent: true,
    inputSchema: z.object({
      article_ids: z
        .array(z.string())
        .optional()
        .describe("Explicit article IDs to fetch relational context for."),
      kb_id: z
        .string()
        .optional()
        .describe("Target KB ID. If omitted, default KB is used."),
      max_depth: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .default(1)
        .describe("Relational traversal depth (1 to 3)."),
      query: z
        .string()
        .optional()
        .describe("Optional search query to fetch starting articles."),
    }),
    outputSchema: z.unknown(),
    handler: async (input: any, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      if (!tenantId) {
        return { error: "tenantId is required" };
      }
      const scopeId = ctx.auth?.scopeId || "default";
      const api = server.contextGraph;
      if (!api) {
        return { error: "ContextGraph server API is not available" };
      }

      const params = input ?? {};
      let startingArticleIds: string[] = params.article_ids ?? [];

      const repos = repoFactory(tenantId, scopeId);

      // If a query is provided and starting IDs are empty, perform a search to find starting articles
      if (queryIsValid(params.query) && startingArticleIds.length === 0) {
        const kbId = params.kb_id || (await repos.kb.list())[0]?.id;
        if (kbId) {
          const searchResults = await repos.articles.listPaginated({
            kb_id: kbId,
            page: 1,
            page_size: 5,
            search: params.query,
            status: "published",
          });
          startingArticleIds = searchResults.data.map((a: any) => a.id);
        }
      }

      if (startingArticleIds.length === 0) {
        return { message: "No starting articles found or provided", graph: {} };
      }

      // Traversal logic
      const visitedEntityIds = new Set<string>();
      const entitiesMap = new Map<string, any>();
      const edgesList: any[] = [];

      let queue: string[] = [];

      // Resolve starting entities in context graph
      for (const artId of startingArticleIds) {
        const entity = await api.getEntity({
          tenantId,
          externalRef: {
            module: "knowledge-base",
            entity: "article",
            id: artId,
          },
        });
        if (entity) {
          entitiesMap.set(entity.id, entity);
          queue.push(entity.id);
          visitedEntityIds.add(entity.id);
        }
      }

      const maxDepth = params.max_depth ?? 1;
      let depth = 0;

      while (queue.length > 0 && depth < maxDepth) {
        const nextQueue: string[] = [];

        for (const entityId of queue) {
          // Fetch edges where entity is subject (outgoing)
          const outgoingEdges = await api.listEdges({
            tenantId,
            fromEntityId: entityId,
          });
          // Fetch edges where entity is object (incoming)
          const incomingEdges = await api.listEdges({
            tenantId,
            toEntityId: entityId,
          });

          const allEdges = [...outgoingEdges, ...incomingEdges];

          for (const edge of allEdges as any[]) {
            edgesList.push({
              id: edge.id,
              type: edge.type,
              subject_id: edge.subject_id,
              object_id: edge.object_id,
              attributes: edge.attributes,
            });

            // Find connected entity ID
            const connectedId =
              edge.subject_id === entityId ? edge.object_id : edge.subject_id;
            if (!visitedEntityIds.has(connectedId)) {
              visitedEntityIds.add(connectedId);
              const connectedEntity = await api.getEntity({
                tenantId,
                id: connectedId,
              });
              if (connectedEntity) {
                entitiesMap.set(connectedId, connectedEntity);
                nextQueue.push(connectedId);
              }
            }
          }
        }

        queue = nextQueue;
        depth++;
      }

      // Format clean output
      const graph = {
        nodes: Array.from(entitiesMap.values()).map((node) => ({
          id: node.id,
          name: node.name,
          type: node.type,
          external_ref: node.external_ref,
          attributes: node.attributes,
        })),
        edges: edgesList,
      };

      return {
        message: `GraphRAG traversal completed up to depth ${maxDepth}.`,
        graph,
      };
    },
  });
}

function queryIsValid(query: unknown): query is string {
  return typeof query === "string" && query.trim().length > 0;
}
