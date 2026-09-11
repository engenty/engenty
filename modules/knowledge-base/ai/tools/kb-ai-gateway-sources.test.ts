import type {
  PluginEventsApi,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { registerKbAiGatewayMethods } from "./kb-ai-gateway-methods.js";

/**
 * Focused tests for the source-lane gateway operations:
 * - kb_source_create must persist preview seed data (initial_index_entries /
 *   ignored_item_keys) and an optional ingest_config — the HTTP route always
 *   did; the gateway op used to silently drop them.
 * - kb_source_ingest is the phase-2 op (items → articles); its agentic
 *   strategy dispatches a task through the cross-module gateway.
 */

type MockServer = Pick<
  PluginServerApi,
  "registerOperation" | "getStorageService"
> &
  Partial<Pick<PluginServerApi, "callGatewayMethod" | "hasOperation">>;

function makeMockServer(overrides?: Partial<MockServer>) {
  const serverOperations: PluginServerOperation[] = [];
  const server = {
    registerOperation: (operation: PluginServerOperation) => {
      serverOperations.push(operation);
    },
    getStorageService: vi.fn(() => null),
    ...overrides,
  } as MockServer;
  const events = {
    modules: {
      emit: async () => {},
    },
  } as unknown as PluginEventsApi;
  return { events, server, serverOperations };
}

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

const createdSource = {
  id: "src-1",
  kb_id: "kb-1",
  adapter_id: "url",
  name: "Docs",
  ingest_config: { agentic_instructions: "", template_mode: "inherit" },
  settings: { url: "https://example.com/docs" },
};

function makeCreateRepos() {
  return {
    kb: {
      getById: vi.fn(async () => ({ id: "kb-1", space_id: undefined })),
    },
    sources: {
      create: vi.fn(async () => createdSource),
      delete: vi.fn(async () => true),
      getById: vi.fn(async () => createdSource),
      update: vi.fn(async () => createdSource),
      upsertSourceItem: vi.fn(async () => ({})),
    },
  };
}

describe("kb_source_create", () => {
  it("persists initial_index_entries with ignored keys, like the HTTP route", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = makeCreateRepos();
    registerKbAiGatewayMethods(server, () => repos as never, events);

    await operationHandler(
      serverOperations,
      "kb_source_create"
    )({
      adapter_id: "url",
      kb_id: "kb-1",
      name: "Docs",
      settings: { url: "https://example.com/docs" },
      ignored_item_keys: ["skip-me"],
      initial_index_entries: [
        { item_key: "keep-me", source_url: "https://example.com/a" },
        { item_key: "skip-me", source_url: "https://example.com/b" },
      ],
    });

    expect(repos.sources.upsertSourceItem).toHaveBeenCalledTimes(2);
    expect(repos.sources.upsertSourceItem).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter_item_key: "keep-me",
        source_id: "src-1",
        status: "active",
      })
    );
    expect(repos.sources.upsertSourceItem).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter_item_key: "skip-me",
        status: "ignored",
      })
    );
  });

  it("persists an ingest_config given at create time", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = makeCreateRepos();
    registerKbAiGatewayMethods(server, () => repos as never, events);

    await operationHandler(
      serverOperations,
      "kb_source_create"
    )({
      adapter_id: "url",
      kb_id: "kb-1",
      name: "Docs",
      settings: { url: "https://example.com/docs" },
      ingest_config: {
        agentic_instructions: "Build a wiki, one article per section.",
        category_id: "cat-1",
      },
    });

    expect(repos.sources.update).toHaveBeenCalledWith(
      "src-1",
      expect.objectContaining({
        ingest_config: expect.objectContaining({
          agentic_instructions: "Build a wiki, one article per section.",
          category_id: "cat-1",
        }),
      })
    );
  });

  it("does not touch ingest_config when none is given", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = makeCreateRepos();
    registerKbAiGatewayMethods(server, () => repos as never, events);

    await operationHandler(
      serverOperations,
      "kb_source_create"
    )({
      adapter_id: "url",
      kb_id: "kb-1",
      name: "Docs",
      settings: { url: "https://example.com/docs" },
    });

    expect(repos.sources.update).not.toHaveBeenCalled();
    expect(repos.sources.upsertSourceItem).not.toHaveBeenCalled();
  });
});

describe("kb_source_ingest", () => {
  it("is registered as a gated write scoped to the source record", () => {
    const { events, server, serverOperations } = makeMockServer();
    registerKbAiGatewayMethods(
      server,
      () => {
        throw new Error("repo should not be resolved during registration");
      },
      events
    );
    const operation = serverOperations.find(
      (item) => item.operationId === "kb_source_ingest"
    );
    expect(operation).toMatchObject({
      idempotent: false,
      requiresApproval: true,
      riskLevel: "medium",
      spacePolicy: {
        kind: "space_owned",
        record: { idInputKey: "source_id", moduleId: "knowledge-base" },
      },
    });
  });

  it("returns an error payload for an unknown source", async () => {
    const { events, server, serverOperations } = makeMockServer();
    const repos = {
      sources: { getById: vi.fn(async () => null) },
    };
    registerKbAiGatewayMethods(server, () => repos as never, events);

    await expect(
      operationHandler(
        serverOperations,
        "kb_source_ingest"
      )({ source_id: "missing", strategy: "per_entry" })
    ).resolves.toEqual({ error: "Source not found" });
  });

  it("dispatches an agentic run as a task and returns async_run", async () => {
    const callGatewayMethod = vi.fn(
      async (methodName: string, _input?: unknown) =>
        methodName === "tasks_create" ? { id: "task-1" } : null
    );
    const hasOperation = vi.fn(() => true);
    const { events, server, serverOperations } = makeMockServer({
      callGatewayMethod:
        callGatewayMethod as unknown as PluginServerApi["callGatewayMethod"],
      hasOperation: hasOperation as unknown as PluginServerApi["hasOperation"],
    });
    const repos = {
      kb: {
        getById: vi.fn(async () => ({
          id: "kb-1",
          name: "Support KB",
          slug: "support",
        })),
      },
      sources: {
        getById: vi.fn(async () => ({
          id: "src-1",
          kb_id: "kb-1",
          name: "Bauordnung",
          ingest_config: {
            agentic_instructions: "Baue ein Wiki zur Wiener Bauordnung.",
            template_mode: "inherit",
          },
        })),
      },
    };
    registerKbAiGatewayMethods(server, () => repos as never, events);

    const result = await operationHandler(
      serverOperations,
      "kb_source_ingest"
    )({ source_id: "src-1", strategy: "agentic" });

    expect(result).toEqual({
      article_ids: [],
      ingested_items: 0,
      strategy: "agentic",
      task_id: "task-1",
      async_run: true,
    });
    expect(callGatewayMethod).toHaveBeenCalledWith(
      "tasks_create",
      expect.objectContaining({
        primary_assignee_agent_type_key: "knowledge-base.manager",
        title: "KB Ingest: Bauordnung",
      }),
      expect.anything()
    );
    // The brief must point the manager at REAL gateway op names — never the
    // in-process closure tools (kb_list_items, kb_create_article, …).
    const brief = (
      callGatewayMethod.mock.calls[0][1] as unknown as { description: string }
    ).description;
    expect(brief).toContain("kb_source_items_list");
    expect(brief).toContain("kb_article_create");
    expect(brief).toContain("kb_categories_list");
    expect(brief).toContain("Baue ein Wiki zur Wiener Bauordnung.");
    expect(brief).not.toContain("kb_list_items");
    expect(brief).not.toContain("kb_create_article");
  });
});
