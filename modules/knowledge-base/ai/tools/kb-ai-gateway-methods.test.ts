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
    expect(opIds).toEqual([
      "kb_list",
      "kb_article_get",
      "kb_articles_list",
      "kb_faqs_list",
      "kb_inbox_get",
      "kb_inbox_create",
      "kb_inbox_update",
      "kb_article_update",
      "kb_article_create",
      "kb_faq_create",
      "kb_faq_update",
      "kb_faq_delete",
      "kb_categories_list",
      "kb_category_create",
      "kb_category_get",
      "kb_category_update",
      "kb_category_delete",
      "kb_sources_list",
      "kb_source_create",
      "kb_source_update",
      "kb_source_delete",
      "kb_source_run",
      "kb_source_runs_list",
      "kb_source_items_list",
      "kb_inbox_promote",
      "kb_inbox_promote_batch",
      "kb_inbox_delete",
      "kb_inbox_fetch_source",
      "kb_article_versions_list",
      "kb_article_version_restore",
      "kb_article_attachments_list",
      "kb_article_attachment_add",
      "kb_article_attachment_delete",
    ]);
    // The synthesized `knowledge_base_article_search` from
    // `registerSearchIndexProvider` replaces this, so the bespoke op must
    // not reappear.
    expect(opIds).not.toContain("kb_search");
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
});
