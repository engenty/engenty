// Lean coverage for the security-critical bits of `search-index-host.ts`:
//
//   1. The synthesized auto-tool **never** trusts caller-supplied
//      `filters.tenant_id` / `filters.user_id` and always overrides them with
//      the authenticated `ctx.auth` values. An LLM-driven agent must not be
//      able to pivot to another tenant by spoofing filters in the request.
//
//   2. Explicit `strategy: "lexical"` is forwarded verbatim to the provider.
//      Quick search (BM25) must stay opt-in even when the provider also
//      advertises `hybrid: true` / `semantic: true` capabilities — we do not
//      auto-upgrade to a paid embedding path just because vectors exist.
//
// Anything else (list/get/event binding semantics) is exercised by callers
// (contacts, kb, chat-search) so we don't re-test it here.

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
