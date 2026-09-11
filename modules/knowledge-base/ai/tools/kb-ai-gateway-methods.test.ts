import type {
  PluginEventsApi,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { registerKbAiGatewayMethods } from "./kb-ai-gateway-methods.js";

function makeMockServer() {
  const serverOperations: PluginServerOperation[] = [];
  const server = {
    registerOperation: (operation: PluginServerOperation) => {
      serverOperations.push(operation);
    },
    getStorageService: vi.fn(() => null),
  } as Pick<PluginServerApi, "registerOperation" | "getStorageService">;
  const events = {
    modules: {
      emit: async () => {},
    },
  } as unknown as PluginEventsApi;
  return { events, server, serverOperations };
}

describe("registerKbAiGatewayMethods", () => {
  it("registers KB gateway operations and no longer ships the bespoke kb.search op", () => {
    const { events, server, serverOperations } = makeMockServer();

    registerKbAiGatewayMethods(
      server,
      () => {
        throw new Error("repo should not be resolved during registration");
      },
      events
    );

    const opIds = serverOperations.map((operation) => operation.operationId);
    expect(opIds.sort()).toEqual(
      [
        "kb_article_attachment_add",
        "kb_article_attachment_delete",
        "kb_article_attachments_list",
        "kb_article_create",
        "kb_article_delete",
        "kb_article_get",
        "kb_article_update",
        "kb_article_version_restore",
        "kb_article_versions_list",
        "kb_articles_list",
        "kb_categories_list",
        "kb_category_create",
        "kb_category_delete",
        "kb_category_get",
        "kb_category_update",
        "kb_faq_create",
        "kb_faq_delete",
        "kb_faq_update",
        "kb_faqs_list",
        "kb_inbox_create",
        "kb_inbox_delete",
        "kb_inbox_fetch_source",
        "kb_inbox_get",
        "kb_inbox_promote",
        "kb_inbox_promote_batch",
        "kb_inbox_update",
        "kb_list",
        "kb_source_analyze",
        "kb_source_create",
        "kb_source_delete",
        "kb_source_ingest",
        "kb_source_items_list",
        "kb_source_run",
        "kb_source_runs_list",
        "kb_source_update",
        "kb_space_mount",
        "kb_sources_list",
        "kb_tag_create",
        "kb_tags_list",
        "kb_update",
      ].sort()
    );
    // The synthesized `knowledge_base_article_search` from
    // `registerSearchIndexProvider` replaces this, so the bespoke op must
    // not reappear.
    expect(opIds).not.toContain("kb_search");
    expect(
      serverOperations.find((operation) => operation.operationId === "kb_list")
        ?.spacePolicy
    ).toEqual({ kind: "space_owned" });
    expect(
      serverOperations.find(
        (operation) => operation.operationId === "kb_article_get"
      )?.spacePolicy
    ).toEqual({
      kind: "space_owned",
      record: { idInputKey: "article_id", moduleId: "knowledge-base" },
    });
    expect(
      serverOperations.find(
        (operation) => operation.operationId === "kb_article_attachment_delete"
      )?.spacePolicy
    ).toEqual({
      kind: "space_owned",
      record: { idInputKey: "attachment_id", moduleId: "knowledge-base" },
    });
  });

  it("lists knowledge bases with display settings", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = {
      kb: {
        list: vi.fn(async () => [
          {
            article_property_definitions: [],
            cover: null,
            cover_inheritance: "none",
            created_at: "2026-05-17T00:00:00.000Z",
            created_by: null,
            deleted_at: null,
            description: "Internal help",
            icon: null,
            id: "kb-1",
            is_default: true,
            name: "Support KB",
            scope_id: "default",
            slug: "support",
            tenant_id: "tenant-1",
            updated_at: "2026-05-17T00:00:00.000Z",
          },
        ]),
      },
      settings: {
        get: vi.fn(async () => ({
          kb_display_by_id: {
            "kb-1": {
              cover: { type: "color", value: "blue" },
              icon: "KB",
            },
          },
          kb_page_layout_by_id: {},
        })),
      },
    };

    registerKbAiGatewayMethods(server, () => repos as never, events);
    const operation = serverOperations.find(
      (item) => item.operationId === "kb_list"
    );

    await expect(
      operation?.handler(
        {},
        {
          auth: undefined,
          config: {},
          dataDir: "",
          logger: {
            debug: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
          },
          pluginConfig: {},
          resolvePath: (path) => path,
        }
      )
    ).resolves.toEqual({
      knowledge_bases: [
        expect.objectContaining({
          cover: { type: "color", value: "blue" },
          icon: "KB",
          id: "kb-1",
          is_default: true,
          name: "Support KB",
          slug: "support",
        }),
      ],
      total: 1,
    });
    expect(repos.kb.list).toHaveBeenCalledTimes(1);
    expect(repos.settings.get).toHaveBeenCalledTimes(1);
  });

  it("links every knowledge base and article into its space", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const kb = {
      id: "kb-1",
      is_default: true,
      name: "Approval Test",
      slug: "approval-test",
      space_id: "space-1",
    };
    const repos = {
      articles: {
        getById: vi.fn(async () => ({
          id: "art-1",
          kb_id: "kb-1",
          title: "Approval test article",
        })),
      },
      kb: {
        getById: vi.fn(async () => kb),
        list: vi.fn(async () => [kb]),
      },
      settings: {
        get: vi.fn(async () => ({
          kb_display_by_id: {},
          kb_page_layout_by_id: {},
        })),
      },
      spaces: { keyById: vi.fn(async () => "brain") },
    };
    registerKbAiGatewayMethods(server, () => repos as never, events);

    await expect(
      operationHandler(serverOperations, "kb_list")({})
    ).resolves.toMatchObject({
      knowledge_bases: [{ link: "/s/brain/kb" }],
    });
    await expect(
      operationHandler(
        serverOperations,
        "kb_article_get"
      )({
        article_id: "art-1",
      })
    ).resolves.toMatchObject({
      article: {
        id: "art-1",
        link: "/s/brain/kb/art-1",
      },
    });
    expect(repos.spaces.keyById).toHaveBeenCalledWith("space-1");
  });

  it("falls back to the /mdl link when the space key is unknown", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = {
      articles: {
        getById: vi.fn(async () => ({ id: "art-1", kb_id: "kb-1" })),
      },
      kb: {
        getById: vi.fn(async () => ({
          id: "kb-1",
          slug: "approval-test",
          space_id: "space-1",
        })),
      },
      spaces: { keyById: vi.fn(async () => null) },
    };
    registerKbAiGatewayMethods(server, () => repos as never, events);
    await expect(
      operationHandler(
        serverOperations,
        "kb_article_get"
      )({
        article_id: "art-1",
      })
    ).resolves.toMatchObject({
      article: { link: "/mdl/knowledge-base/art-1" },
    });
  });

  it("narrows the knowledge bases to one space when asked", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = {
      kb: { list: vi.fn(async () => []) },
      settings: {
        get: vi.fn(async () => ({
          kb_display_by_id: {},
          kb_page_layout_by_id: {},
        })),
      },
    };
    registerKbAiGatewayMethods(server, () => repos as never, events);

    await operationHandler(
      serverOperations,
      "kb_list"
    )({
      space_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(repos.kb.list).toHaveBeenCalledWith({
      spaceId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("lists article rows with the fields that say where they belong", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = {
      articles: {
        listPaginated: vi.fn(async () => ({
          data: [
            {
              category_id: "cat-1",
              content_markdown: "the body",
              id: "art-1",
              parent_article_id: "art-0",
              slug: "getting-started",
              status: "published",
              summary: "How to start",
              title: "Getting started",
              updated_at: "2026-08-15T09:00:00.000Z",
            },
          ],
          page: 1,
          page_size: 200,
          total: 1,
        })),
      },
      kb: {
        getById: vi.fn(async () => ({ id: "kb-1" })),
        list: vi.fn(async () => [{ id: "kb-1" }]),
      },
    };
    registerKbAiGatewayMethods(server, () => repos as never, events);

    const result = (await operationHandler(
      serverOperations,
      "kb_articles_list"
    )({
      category_id: "cat-1",
      kb_id: "kb-1",
      page_size: 200,
    })) as { articles: Record<string, unknown>[] };

    // The structure fields are the point: without them the space Data tree
    // cannot place an article, and `content_markdown` staying OUT is the point
    // too — a listing must not carry every article's full body.
    expect(result.articles[0]).toEqual({
      category_id: "cat-1",
      id: "art-1",
      parent_article_id: "art-0",
      slug: "getting-started",
      status: "published",
      summary: "How to start",
      title: "Getting started",
      updated_at: "2026-08-15T09:00:00.000Z",
    });
    expect(repos.articles.listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: "cat-1", page_size: 200 })
    );
  });

  /**
   * The regression this exists for: `articleUpdateSchema` is
   * `articleCreateSchema.partial()`, and `.partial()` does NOT stop `.default()`
   * from firing. Before the fix, renaming an article also set `status: "draft"`
   * — an edit that unpublishes what it renames, with nothing on screen saying
   * so.
   */
  it("applies ONLY the fields a patch actually names", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = {
      articles: {
        update: vi.fn(async () => ({ id: "art-1", title: "New title" })),
      },
    };
    registerKbAiGatewayMethods(server, () => repos as never, events);

    await operationHandler(
      serverOperations,
      "kb_article_update"
    )({
      article_id: "art-1",
      patch: { title: "New title" },
    });

    expect(repos.articles.update).toHaveBeenCalledWith(
      "art-1",
      { title: "New title" },
      undefined,
      null
    );
  });

  /** Same `.partial()`-keeps-`.default()` trap, FAQ lane. */
  it("kb_faq_update applies ONLY the fields the patch names", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = {
      faqs: {
        update: vi.fn(async () => ({ id: "faq-1", question: "Renamed?" })),
      },
    };
    registerKbAiGatewayMethods(server, () => repos as never, events);

    await operationHandler(
      serverOperations,
      "kb_faq_update"
    )({
      faq_id: "faq-1",
      patch: { question: "Renamed?" },
    });

    expect(repos.faqs.update).toHaveBeenCalledWith(
      "faq-1",
      { question: "Renamed?" },
      undefined,
      null
    );
  });

  /** Same trap, category lane — a rename must not reset sort_order. */
  it("kb_category_update applies ONLY the fields the patch names", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = {
      categories: {
        getById: vi.fn(async () => ({ id: "cat-1", name: "Old" })),
        update: vi.fn(async () => ({ id: "cat-1", name: "Renamed" })),
      },
    };
    registerKbAiGatewayMethods(server, () => repos as never, events);

    await operationHandler(
      serverOperations,
      "kb_category_update"
    )({
      category_id: "cat-1",
      patch: { name: "Renamed" },
    });

    expect(repos.categories.update).toHaveBeenCalledWith("cat-1", {
      name: "Renamed",
    });
  });

  it("still refuses a value the schema rejects", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = { articles: { update: vi.fn() } };
    registerKbAiGatewayMethods(server, () => repos as never, events);

    await expect(
      operationHandler(
        serverOperations,
        "kb_article_update"
      )({
        article_id: "art-1",
        patch: { status: "not-a-status" },
      })
    ).rejects.toThrow();
    expect(repos.articles.update).not.toHaveBeenCalled();
  });
});

/** One operation's handler, with the context every KB handler ignores. */
function operationHandler(
  operations: PluginServerOperation[],
  operationId: string
): (input: unknown) => Promise<unknown> {
  const operation = operations.find((item) => item.operationId === operationId);
  if (!operation) {
    throw new Error(`No operation ${operationId}`);
  }
  return async (input: unknown) =>
    operation.handler(input, {
      auth: undefined,
      config: {},
      dataDir: "",
      logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
      pluginConfig: {},
      resolvePath: (path) => path,
    });
}
