import type {
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  registerKbContextGraph,
  registerKbGraphRagSearchOperation,
} from "./kb-graph-rag.js";

// Helper to create a stub Supabase client
function createStubSupabase(input: { categories: any[]; articles: any[] }) {
  const catChain: Record<string, any> = {};
  catChain.select = vi.fn(() => catChain);
  catChain.eq = vi.fn(() => catChain);

  const artChain: Record<string, any> = {};
  artChain.select = vi.fn(() => artChain);
  artChain.eq = vi.fn(() => artChain);
  artChain.is = vi.fn(() => artChain);

  // For getStatus
  const headChain: Record<string, any> = {};
  headChain.select = vi.fn(() => headChain);
  headChain.eq = vi.fn(() => headChain);
  headChain.is = vi.fn(() => ({
    count: input.articles.length,
    error: null,
  }));

  const fromFn = (table: string) => {
    if (table === "categories") {
      // biome-ignore lint/suspicious/noThenProperty: Mocking a thenable Supabase query builder
      catChain.then = (onfulfilled: any) =>
        Promise.resolve({
          data: input.categories,
          count: input.categories.length,
          error: null,
        }).then(onfulfilled);
      return catChain;
    }
    if (table === "articles") {
      // biome-ignore lint/suspicious/noThenProperty: Mocking a thenable Supabase query builder
      artChain.then = (onfulfilled: any) =>
        Promise.resolve({
          data: input.articles,
          count: input.articles.length,
          error: null,
        }).then(onfulfilled);
      return artChain;
    }
    return headChain;
  };

  const schemaFn = (name: string) => ({
    from: fromFn,
  });

  return {
    schema: schemaFn,
  } as unknown as SupabaseClient;
}

describe("KB GraphRAG Integration & Context Graph Registration", () => {
  describe("registerKbContextGraph", () => {
    it("registers KB article and category entities, and appropriate edge types", () => {
      let registeredSchema: any = null;
      let registeredSource: any = null;

      const server = {
        registerContextGraphSchema: (schema: any) => {
          registeredSchema = schema;
        },
        registerContextGraphSource: (source: any) => {
          registeredSource = source;
        },
      } as unknown as PluginServerApi;

      const supabase = createStubSupabase({ categories: [], articles: [] });

      registerKbContextGraph({ getDb: () => supabase, server });

      expect(registeredSchema).not.toBeNull();
      expect(registeredSchema.moduleId).toBe("knowledge-base");
      expect(registeredSchema.entityTypes.map((t: any) => t.id).sort()).toEqual(
        ["knowledge-base.article", "knowledge-base.category"]
      );
      expect(registeredSchema.edgeTypes.map((t: any) => t.id).sort()).toEqual([
        "knowledge-base.category_child_of",
        "knowledge-base.category_member",
        "knowledge-base.child_of",
        "knowledge-base.links_to",
      ]);

      expect(registeredSource).not.toBeNull();
      expect(registeredSource.id).toBe("knowledge-base");
      expect(registeredSource.entityTypeIds).toEqual([
        "knowledge-base.article",
        "knowledge-base.category",
      ]);
    });

    it("getStatus correctly counts entities in context graph vs supabase source", async () => {
      let registeredSource: any = null;
      const server = {
        registerContextGraphSchema: () => {},
        registerContextGraphSource: (source: any) => {
          registeredSource = source;
        },
      } as unknown as PluginServerApi;

      const supabase = createStubSupabase({
        categories: [],
        articles: [{ id: "art-1" }, { id: "art-2" }],
      });

      registerKbContextGraph({ getDb: () => supabase, server });

      const mockApi = {
        listEntities: vi.fn(async () => [{}, {}]),
      };

      const status = await registeredSource.getStatus(mockApi, "tenant-1");
      expect(status).toEqual({ inGraph: 2, inSource: 2 });
      expect(mockApi.listEntities).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        module: "knowledge-base",
      });
    });

    it("sync correctly backfills entities and edges to the context graph API", async () => {
      let registeredSource: any = null;
      const server = {
        registerContextGraphSchema: () => {},
        registerContextGraphSource: (source: any) => {
          registeredSource = source;
        },
      } as unknown as PluginServerApi;

      const categories = [
        {
          id: "cat-1",
          name: "Cat 1",
          slug: "cat-1",
          description: "Desc 1",
          parent_category_id: null,
        },
        {
          id: "cat-2",
          name: "Cat 2",
          slug: "cat-2",
          description: "Desc 2",
          parent_category_id: "cat-1",
        },
      ];

      const articles = [
        {
          id: "art-1",
          title: "Art 1",
          slug: "art-1",
          summary: "Sum 1",
          category_id: "cat-1",
          parent_article_id: null,
        },
        {
          id: "art-2",
          title: "Art 2",
          slug: "art-2",
          summary: "Sum 2",
          category_id: "cat-2",
          parent_article_id: "art-1",
        },
      ];

      const supabase = createStubSupabase({ categories, articles });

      registerKbContextGraph({ getDb: () => supabase, server });

      const upsertedEntities: any[] = [];
      const upsertedEdges: any[] = [];
      const entitiesStore = new Map<string, any>();

      // populate pre-mocked getEntity
      entitiesStore.set("cat-1", { id: "g-cat-1" });
      entitiesStore.set("cat-2", { id: "g-cat-2" });
      entitiesStore.set("art-1", { id: "g-art-1" });
      entitiesStore.set("art-2", { id: "g-art-2" });

      const mockApi = {
        upsertEntity: vi.fn(async (input) => {
          upsertedEntities.push(input);
        }),
        getEntity: vi.fn(async (input) =>
          entitiesStore.get(input.externalRef.id)
        ),
        upsertEdge: vi.fn(async (input) => {
          upsertedEdges.push(input);
        }),
      };

      const result = await registeredSource.sync(mockApi, "tenant-1");

      // 2 categories + 2 articles = 4 entities
      expect(result.entities).toBe(4);
      expect(upsertedEntities).toHaveLength(4);

      // cat-2 is child of cat-1 (1 edge)
      // art-1 in cat-1 (1 edge)
      // art-2 in cat-2 (1 edge)
      // art-2 is child of art-1 (1 edge)
      // Total 4 edges
      expect(result.edges).toBe(4);
      expect(upsertedEdges).toHaveLength(4);

      expect(upsertedEdges).toContainEqual({
        tenantId: "tenant-1",
        type: "knowledge-base.category_child_of",
        subjectId: "g-cat-2",
        objectId: "g-cat-1",
      });

      expect(upsertedEdges).toContainEqual({
        tenantId: "tenant-1",
        type: "knowledge-base.category_member",
        subjectId: "g-art-1",
        objectId: "g-cat-1",
      });

      expect(upsertedEdges).toContainEqual({
        tenantId: "tenant-1",
        type: "knowledge-base.category_member",
        subjectId: "g-art-2",
        objectId: "g-cat-2",
      });

      expect(upsertedEdges).toContainEqual({
        tenantId: "tenant-1",
        type: "knowledge-base.child_of",
        subjectId: "g-art-2",
        objectId: "g-art-1",
      });
    });
  });

  describe("kb_graph_rag_search operation", () => {
    it("registers and traverses context graph using adjacent entity queries", async () => {
      let registeredOperation: PluginServerOperation | null = null;
      const getEntityMock = vi.fn();
      const listEdgesMock = vi.fn();

      const server = {
        registerOperation: (op: any) => {
          registeredOperation = op;
        },
        contextGraph: {
          getEntity: getEntityMock,
          listEdges: listEdgesMock,
        },
      } as unknown as PluginServerApi;

      const repos = {
        kb: {
          list: vi.fn(async () => [{ id: "kb-1" }]),
        },
        articles: {
          listPaginated: vi.fn(async () => ({
            data: [{ id: "art-from-search" }],
          })),
        },
      };

      registerKbGraphRagSearchOperation(server, () => repos);

      expect(registeredOperation).not.toBeNull();
      expect(registeredOperation!.operationId).toBe("kb_graph_rag_search");

      // Setup traversals.
      // Starting from "art-from-search" -> resolves to graph ID "g-art-1".
      // From "g-art-1", we have outgoing edge to "g-cat-1" and incoming edge from "g-art-2".
      getEntityMock.mockImplementation(async (input: any) => {
        if (input.externalRef?.id === "art-from-search") {
          return {
            id: "g-art-1",
            name: "Art 1",
            type: "knowledge-base.article",
            external_ref: input.externalRef,
            attributes: { title: "Art 1" },
          };
        }
        if (input.id === "g-cat-1") {
          return {
            id: "g-cat-1",
            name: "Category 1",
            type: "knowledge-base.category",
            external_ref: { id: "cat-1" },
            attributes: {},
          };
        }
        if (input.id === "g-art-2") {
          return {
            id: "g-art-2",
            name: "Art 2",
            type: "knowledge-base.article",
            external_ref: { id: "art-2" },
            attributes: {},
          };
        }
        return null;
      });

      listEdgesMock.mockImplementation(async (input: any) => {
        if (input.fromEntityId === "g-art-1") {
          // outgoing to category
          return [
            {
              id: "edge-1",
              type: "knowledge-base.category_member",
              subject_id: "g-art-1",
              object_id: "g-cat-1",
            },
          ];
        }
        if (input.toEntityId === "g-art-1") {
          // incoming from article 2
          return [
            {
              id: "edge-2",
              type: "knowledge-base.child_of",
              subject_id: "g-art-2",
              object_id: "g-art-1",
            },
          ];
        }
        return [];
      });

      const handler = registeredOperation!.handler;
      const res = (await handler(
        { query: "search terms", max_depth: 1 },
        {
          auth: {
            principalId: "user-1",
            tenantId: "tenant-1",
            scopeId: "default",
          },
          config: {},
          dataDir: "",
          logger: {} as any,
          pluginConfig: {},
          resolvePath: (p) => p,
        }
      )) as {
        graph: { edges: unknown[]; nodes: Array<{ id: string }> };
        message: string;
      };

      expect(repos.articles.listPaginated).toHaveBeenCalledWith({
        kb_id: "kb-1",
        page: 1,
        page_size: 5,
        search: "search terms",
        status: "published",
      });

      expect(res.message).toContain("depth 1");
      expect(res.graph.nodes).toHaveLength(3);
      expect(res.graph.nodes.map((n: any) => n.id).sort()).toEqual([
        "g-art-1",
        "g-art-2",
        "g-cat-1",
      ]);
      expect(res.graph.edges).toHaveLength(2);
    });
  });
});
