// The search index host must never trust caller-supplied tenant or user
// filters, must forward an explicit strategy verbatim, and must keep a tenant's
// index in step with its records (deletes and vanished rows remove documents).

import type {
  SearchIndexProvider,
  SearchProviderCapabilities,
  SearchRequest,
  SearchResponse,
  SearchStrategy,
} from "@engenty/search-index";
import { describe, expect, it, vi } from "vitest";
import { synthesizeSearchOperation } from "./search-index-host.js";

function makeProvider(
  capabilities: SearchProviderCapabilities,
  searchImpl?: (
    req: SearchRequest<Record<string, unknown>>
  ) => Promise<SearchResponse<unknown>>
): SearchIndexProvider {
  return {
    capabilities,
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    id: "tests.entity",
    replaceDocument: vi.fn().mockResolvedValue(undefined),
    search: vi
      .fn()
      .mockImplementation(
        searchImpl ?? (async () => ({ results: [], total: 0 }))
      ),
    version: "1",
  } satisfies SearchIndexProvider;
}

describe("synthesizeSearchOperation — security boundary", () => {
  it("overrides spoofed tenant_id/user_id with ctx.auth values", async () => {
    const provider = makeProvider({ hybrid: true, lexical: true });
    const op = synthesizeSearchOperation(provider, {
      capabilities: provider.capabilities ?? {},
      entityName: "entity",
      moduleId: "tests",
    });

    await op.handler(
      {
        filters: { tenant_id: "evil-tenant", user_id: "evil-user" },
        limit: 5,
        query: "ada",
      },
      { auth: { tenantId: "real-tenant", userId: "real-user" } }
    );

    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          tenant_id: "real-tenant",
          user_id: "real-user",
        }),
      })
    );
  });

  it("strips spoofed tenant_id/user_id when ctx.auth is missing", async () => {
    const provider = makeProvider({ hybrid: true });
    const op = synthesizeSearchOperation(provider, {
      capabilities: provider.capabilities ?? {},
      entityName: "entity",
      moduleId: "tests",
    });

    await op.handler(
      { filters: { tenant_id: "spoof", user_id: "spoof" }, limit: 5 },
      {}
    );

    const call = (provider.search as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as SearchRequest<Record<string, unknown>>;
    expect(call.filters).toBeDefined();
    expect((call.filters as Record<string, unknown>).tenant_id).toBeUndefined();
    expect((call.filters as Record<string, unknown>).user_id).toBeUndefined();
  });
});

describe("synthesizeSearchOperation — space containment", () => {
  it("scopes a space_owned search to the run's space and drops spoofed space_ids", async () => {
    const provider = makeProvider({ hybrid: true, lexical: true });
    const op = synthesizeSearchOperation(provider, {
      capabilities: provider.capabilities ?? {},
      entityName: "entity",
      moduleId: "tests",
      spacePolicy: { kind: "space_owned" },
    });

    await op.handler(
      { filters: { space_ids: ["evil-space"] }, limit: 5, query: "ada" },
      { auth: { spaceId: "space-1", tenantId: "t1", userId: "u1" } }
    );

    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ space_ids: ["space-1"] }),
      })
    );
  });

  it("scopes an account_mounted search (mail) to the run's space", async () => {
    const provider = makeProvider({ hybrid: true, lexical: true });
    const op = synthesizeSearchOperation(provider, {
      capabilities: provider.capabilities ?? {},
      entityName: "entity",
      moduleId: "tests",
      spacePolicy: { kind: "account_mounted" },
    });

    await op.handler(
      { limit: 5, query: "ada" },
      { auth: { spaceId: "space-1", tenantId: "t1" } }
    );

    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ space_ids: ["space-1"] }),
      })
    );
  });

  it("leaves an unbound run (no space) unscoped", async () => {
    const provider = makeProvider({ hybrid: true, lexical: true });
    const op = synthesizeSearchOperation(provider, {
      capabilities: provider.capabilities ?? {},
      entityName: "entity",
      moduleId: "tests",
      spacePolicy: { kind: "space_owned" },
    });

    await op.handler({ limit: 5, query: "ada" }, { auth: { tenantId: "t1" } });

    const call = (provider.search as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as {
      filters: Record<string, unknown>;
    };
    expect(call.filters.space_ids).toBeUndefined();
  });

  it("never scopes a tenant_shared source by space", async () => {
    const provider = makeProvider({ hybrid: true, lexical: true });
    const op = synthesizeSearchOperation(provider, {
      capabilities: provider.capabilities ?? {},
      entityName: "entity",
      moduleId: "tests",
      spacePolicy: { kind: "tenant_shared" },
    });

    await op.handler(
      { limit: 5, query: "ada" },
      { auth: { spaceId: "space-1", tenantId: "t1" } }
    );

    const call = (provider.search as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as {
      filters: Record<string, unknown>;
    };
    expect(call.filters.space_ids).toBeUndefined();
  });
});

describe("synthesizeSearchOperation — explicit lexical (BM25)", () => {
  it("forwards strategy='lexical' verbatim even when hybrid/semantic exist", async () => {
    const provider = makeProvider({
      hybrid: true,
      lexical: true,
      semantic: true,
    });
    const op = synthesizeSearchOperation(provider, {
      capabilities: provider.capabilities ?? {},
      entityName: "entity",
      moduleId: "tests",
    });

    await op.handler(
      { limit: 5, query: "ada", strategy: "lexical" satisfies SearchStrategy },
      { auth: { tenantId: "t-1" } }
    );

    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "lexical" })
    );
  });

  it("falls back to capability resolution only when strategy is omitted", async () => {
    const provider = makeProvider({ lexical: true, semantic: false });
    const op = synthesizeSearchOperation(provider, {
      capabilities: provider.capabilities ?? {},
      entityName: "entity",
      moduleId: "tests",
    });

    await op.handler({ limit: 5, query: "ada" }, { auth: { tenantId: "t-1" } });

    const call = (provider.search as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as SearchRequest<Record<string, unknown>>;
    expect(call.strategy).toBeDefined();
    // No semantic capability → resolver picks `lexical`, not `hybrid`.
    expect(call.strategy).toBe("lexical");
  });
});

describe("synthesizeSearchOperation — spacePolicy", () => {
  it("puts the declared policy on the synthesized operation", () => {
    const provider = makeProvider({ lexical: true });
    const op = synthesizeSearchOperation(provider, {
      capabilities: provider.capabilities ?? {},
      entityName: "entity",
      moduleId: "tests",
      spacePolicy: { kind: "tenant_shared" },
    });
    expect(op.spacePolicy).toEqual({ kind: "tenant_shared" });
  });

  it("leaves spacePolicy undefined when the registration omits it", () => {
    const provider = makeProvider({ lexical: true });
    const op = synthesizeSearchOperation(provider, {
      capabilities: provider.capabilities ?? {},
      entityName: "entity",
      moduleId: "tests",
    });
    expect(op.spacePolicy).toBeUndefined();
  });
});

describe("createSearchIndexHost — plugin reload", () => {
  it("re-synthesizes the search op when the same provider id re-registers", async () => {
    const { createSearchIndexRegistry } = await import("@engenty/search-index");
    const { createSearchIndexHost } = await import("./search-index-host.js");
    const registerOperation = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const register = createSearchIndexHost({
      events: {
        core: { emit: vi.fn().mockResolvedValue(undefined) },
        modules: { on: vi.fn().mockReturnValue({ dispose: vi.fn() }) },
      } as never,
      registry: createSearchIndexRegistry(),
      server: { registerOperation } as never,
    });
    const options = {
      capabilities: { lexical: true },
      entityName: "entity",
      moduleId: "tests",
    };

    register(makeProvider({ lexical: true }), options);
    // A dev hot-reload drops the module's operations and registers the same
    // provider id again — the op must be synthesized again, not skipped.
    register(makeProvider({ lexical: true }), options);

    expect(registerOperation).toHaveBeenCalledTimes(2);
    expect(registerOperation.mock.calls[1]?.[0]?.operationId).toBe(
      "tests_entity_search"
    );
  });

  it("forwards a declared spacePolicy onto the registered operation", async () => {
    const { createSearchIndexRegistry } = await import("@engenty/search-index");
    const { createSearchIndexHost } = await import("./search-index-host.js");
    const registerOperation = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const register = createSearchIndexHost({
      events: {
        core: { emit: vi.fn().mockResolvedValue(undefined) },
        modules: { on: vi.fn().mockReturnValue({ dispose: vi.fn() }) },
      } as never,
      registry: createSearchIndexRegistry(),
      server: { registerOperation } as never,
    });

    register(makeProvider({ lexical: true }), {
      capabilities: { lexical: true },
      entityName: "entity",
      moduleId: "tests",
      spacePolicy: { kind: "user_owned" },
    });

    expect(registerOperation.mock.calls[0]?.[0]?.spacePolicy).toEqual({
      kind: "user_owned",
    });
  });
});

describe("bindSearchIndexProviderEvents — keeping the index consistent", () => {
  async function setup() {
    const { createPluginEventsRuntime } = await import("./plugin-events.js");
    const { bindSearchIndexProviderEvents } = await import(
      "./search-index-host.js"
    );
    const indexed = new Set(["t-1:doc-1", "t-1:doc-2", "t-2:doc-1"]);
    const provider: SearchIndexProvider = {
      ...makeProvider({ lexical: true }),
      deleteDocument: async ({ doc_id, tenant_id }) => {
        indexed.delete(`${tenant_id}:${doc_id}`);
      },
      getDocumentById: async () => null,
    };
    const events = createPluginEventsRuntime().createApi();
    bindSearchIndexProviderEvents(events, provider, {
      entityName: "thing",
      moduleId: "tests",
      onEvents: [
        {
          action: "delete",
          docId: (payload) => (payload as { id?: string }).id ?? null,
          name: "tests.thing.deleted",
        },
        {
          action: "replace",
          docId: (payload) => (payload as { id?: string }).id ?? null,
          name: "tests.thing.updated",
        },
      ],
    });
    return { events, indexed };
  }

  it("removes a deleted record from that tenant's index", async () => {
    const { events, indexed } = await setup();

    await events.modules.emit(
      "tests.thing.deleted",
      { id: "doc-1" },
      { tenantId: "t-1" }
    );

    expect([...indexed].sort()).toEqual(["t-1:doc-2", "t-2:doc-1"]);
  });

  it("removes an updated record whose source row is gone", async () => {
    const { events, indexed } = await setup();

    await events.modules.emit(
      "tests.thing.updated",
      { id: "doc-2" },
      { tenantId: "t-1" }
    );

    expect(indexed.has("t-1:doc-2")).toBe(false);
  });
});

describe("createSearchIndexHost — dispose", () => {
  it("unregisters the provider and its synthesized operation", async () => {
    const { createSearchIndexRegistry } = await import("@engenty/search-index");
    const { createPluginEventsRuntime } = await import("./plugin-events.js");
    const { createSearchIndexHost } = await import("./search-index-host.js");
    const registry = createSearchIndexRegistry();
    const disposeOperation = vi.fn();
    const register = createSearchIndexHost({
      events: createPluginEventsRuntime().createApi(),
      registry,
      server: {
        registerOperation: () => ({ dispose: disposeOperation }),
      } as never,
    });

    const receipt = register(makeProvider({ lexical: true }), {
      entityName: "entity",
      moduleId: "tests",
    });
    expect(registry.has("tests.entity")).toBe(true);

    await receipt?.dispose();

    expect(registry.has("tests.entity")).toBe(false);
    expect(disposeOperation).toHaveBeenCalled();
  });
});
