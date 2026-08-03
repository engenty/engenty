// Tests for `apps/core/src/plugins/search-index-host.ts`.
// Covers operation synthesis (auto-tool), declarative re-index event binding,
// composite receipt disposal, and `getDocumentById` fallback.

import {
  createPluginEventsRuntime,
  type PluginRegistrationReceipt,
} from "@engenty/plugin-sdk";
import {
  createSearchIndexRegistry,
  type SearchIndexProvider,
} from "@engenty/search-index";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  bindSearchIndexProviderEvents,
  createSearchIndexHost,
  resolveSearchOperationId,
  synthesizeSearchOperation,
} from "./search-index-host.js";

interface StubDoc {
  chunks?: never;
  doc_id: string;
  source_id: string;
  source_type: string;
  tenant_id: string;
  text: string;
}

function makeProvider(overrides: Partial<SearchIndexProvider> = {}) {
  const search = vi.fn().mockResolvedValue({ results: [], total: 0 });
  const replaceDocument = vi.fn().mockResolvedValue(undefined);
  const deleteDocument = vi.fn().mockResolvedValue(undefined);
  const getDocumentById = vi.fn().mockResolvedValue(null);
  return {
    provider: {
      capabilities: { hybrid: true, lexical: true, semantic: true },
      deleteDocument,
      getDocumentById,
      id: "tests.search",
      replaceDocument,
      search,
      version: "1",
      ...overrides,
    } satisfies SearchIndexProvider,
    deleteDocument,
    getDocumentById,
    replaceDocument,
    search,
  };
}

describe("resolveSearchOperationId", () => {
  it("defaults to <moduleId>.<entityName>.search", () => {
    expect(
      resolveSearchOperationId({
        entityName: "contact",
        moduleId: "contacts",
      })
    ).toBe("contacts_contact_search");
  });

  it("honors explicit override", () => {
    expect(
      resolveSearchOperationId({
        entityName: "x",
        moduleId: "y",
        operationId: "y_search",
      })
    ).toBe("y_search");
  });
});

describe("synthesizeSearchOperation", () => {
  it("builds a low-risk idempotent operation that delegates to provider.search", async () => {
    const { provider, search } = makeProvider();
    // Inferred: synthesizeSearchOperation returns the SDK's deliberately
    // loose MinimalServerOperation (it quotes the shape locally to dodge a
    // cyclic import), which is weaker than PluginServerOperation.
    const op = synthesizeSearchOperation(provider, {
      entityName: "thing",
      filtersSchema: z.object({ owner: z.string() }),
      moduleId: "tests",
    });
    expect(op.operationId).toBe("tests_thing_search");
    expect(op.idempotent).toBe(true);
    expect(op.riskLevel).toBe("low");
    expect(op.requiresApproval).toBe(false);

    await op.handler(
      { filters: { owner: "alice" }, limit: 10, query: "x" },
      // unused ctx
      {} as never
    );
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { owner: "alice" },
        limit: 10,
        query: "x",
        strategy: "hybrid",
      })
    );
  });

  it("uses caller strategy when provided", async () => {
    const { provider, search } = makeProvider({
      capabilities: { lexical: true },
    });
    const op = synthesizeSearchOperation(provider, {
      entityName: "thing",
      moduleId: "tests",
    });
    await op.handler(
      { limit: 5, query: "x", strategy: "lexical" },
      {} as never
    );
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "lexical" })
    );
  });
});

describe("bindSearchIndexProviderEvents", () => {
  function setup() {
    const events = createPluginEventsRuntime().createApi();
    return events;
  }

  it("invokes provider.deleteDocument on delete bindings", async () => {
    const events = setup();
    const { deleteDocument, provider } = makeProvider();
    bindSearchIndexProviderEvents(events, provider, {
      entityName: "thing",
      moduleId: "tests",
      onEvents: [
        {
          action: "delete",
          docId: (payload) => (payload as { id?: string }).id ?? null,
          name: "tests.thing.deleted",
        },
      ],
    });
    await events.modules.emit(
      "tests.thing.deleted",
      { id: "doc-1", tenant_id: "t-1" },
      { tenantId: "t-1" }
    );
    expect(deleteDocument).toHaveBeenCalledWith({
      doc_id: "doc-1",
      tenant_id: "t-1",
    });
  });

  it("loads + replaces via getDocumentById on replace bindings", async () => {
    const events = setup();
    const doc: StubDoc = {
      doc_id: "doc-2",
      source_id: "s",
      source_type: "thing",
      tenant_id: "t-1",
      text: "body",
    };
    const { getDocumentById, provider, replaceDocument } = makeProvider();
    getDocumentById.mockResolvedValue(doc);

    bindSearchIndexProviderEvents(events, provider, {
      entityName: "thing",
      moduleId: "tests",
      onEvents: [
        {
          action: "replace",
          docId: (payload) => (payload as { id?: string }).id ?? null,
          name: "tests.thing.updated",
        },
      ],
    });

    await events.modules.emit(
      "tests.thing.updated",
      { id: "doc-2", tenant_id: "t-1" },
      { tenantId: "t-1" }
    );
    expect(getDocumentById).toHaveBeenCalledWith({
      doc_id: "doc-2",
      tenant_id: "t-1",
    });
    expect(replaceDocument).toHaveBeenCalledWith({ document: doc });
  });

  it("treats missing document on replace as delete", async () => {
    const events = setup();
    const { deleteDocument, getDocumentById, provider, replaceDocument } =
      makeProvider();
    getDocumentById.mockResolvedValue(null);

    bindSearchIndexProviderEvents(events, provider, {
      entityName: "thing",
      moduleId: "tests",
      onEvents: [
        {
          action: "replace",
          docId: (payload) => (payload as { id?: string }).id ?? null,
          name: "tests.thing.updated",
        },
      ],
    });

    await events.modules.emit(
      "tests.thing.updated",
      { id: "doc-3", tenant_id: "t-1" },
      { tenantId: "t-1" }
    );
    expect(replaceDocument).not.toHaveBeenCalled();
    expect(deleteDocument).toHaveBeenCalledWith({
      doc_id: "doc-3",
      tenant_id: "t-1",
    });
  });

  it("invokes onError when provider call throws", async () => {
    const events = setup();
    const { deleteDocument, provider } = makeProvider();
    deleteDocument.mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    bindSearchIndexProviderEvents(
      events,
      provider,
      {
        entityName: "thing",
        moduleId: "tests",
        onEvents: [
          {
            action: "delete",
            docId: () => "doc-4",
            name: "tests.thing.deleted",
          },
        ],
      },
      onError
    );
    await events.modules.emit(
      "tests.thing.deleted",
      { tenant_id: "t-1" },
      { tenantId: "t-1" }
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete",
        docId: "doc-4",
        eventName: "tests.thing.deleted",
      })
    );
  });
});

describe("createSearchIndexHost", () => {
  it("registers provider, synthesizes op, and dispose rolls back", async () => {
    const events = createPluginEventsRuntime().createApi();
    const registry = createSearchIndexRegistry();
    const opReceipt: PluginRegistrationReceipt = {
      dispose: vi.fn(),
      generationId: undefined,
      id: "op-receipt",
      kind: "server.moduleOperation",
      pluginId: "tests",
      sourceInfo: {
        manifestId: "tests",
        manifestPath: "tests",
        pluginId: "tests",
        registrationKind: "server.moduleOperation",
        rootDir: "",
        source: "tests",
        sourceType: "module",
      },
    };
    const registerOperation = vi.fn().mockReturnValue(opReceipt);
    const server = {
      registerOperation,
    } as never;

    const { provider, deleteDocument } = makeProvider();
    const register = createSearchIndexHost({
      events,
      registry,
      server,
    });

    const receipt = register(provider, {
      entityName: "thing",
      moduleId: "tests",
      onEvents: [
        {
          action: "delete",
          docId: (payload) => (payload as { id?: string }).id ?? null,
          name: "tests.thing.deleted",
        },
      ],
    });
    expect(receipt).toBeDefined();
    expect(registry.has("tests.search")).toBe(true);
    expect(registerOperation).toHaveBeenCalledTimes(1);
    const registration = registry.getRegistration("tests.search");
    expect(registration?.metadata).toMatchObject({
      capabilities: { hybrid: true, lexical: true, semantic: true },
      entityName: "thing",
      isSystem: false,
      moduleId: "tests",
      operationId: "tests_thing_search",
      version: "1",
    });

    // Event still flows.
    await events.modules.emit(
      "tests.thing.deleted",
      { id: "x", tenant_id: "t-1" },
      { tenantId: "t-1" }
    );
    expect(deleteDocument).toHaveBeenCalled();

    await receipt!.dispose();
    expect(opReceipt.dispose).toHaveBeenCalled();
    expect(registry.has("tests.search")).toBe(false);
  });

  it("skips operation synthesis when skipAutoTool is true", () => {
    const events = createPluginEventsRuntime().createApi();
    const registry = createSearchIndexRegistry();
    const registerOperation = vi.fn();
    const server = { registerOperation } as never;
    const { provider } = makeProvider();
    const register = createSearchIndexHost({ events, registry, server });
    const receipt = register(provider, {
      entityName: "thing",
      isSystem: true,
      moduleId: "tests",
      skipAutoTool: true,
    });
    expect(receipt).toBeDefined();
    expect(registerOperation).not.toHaveBeenCalled();
    expect(registry.has("tests.search")).toBe(true);
    expect(registry.getRegistration("tests.search")?.metadata).toMatchObject({
      entityName: "thing",
      isSystem: true,
      moduleId: "tests",
      operationId: undefined,
    });
  });
});
