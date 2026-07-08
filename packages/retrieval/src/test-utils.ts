// Test-only fakes shared by the unit tests. Not exported from the package.

import { defineEmbedder, type SearchEmbedder } from "@engenty/search-index";
import type {
  RetrievalDocument,
  RetrievalSourceRegistration,
} from "./contracts.js";

/** Deterministic embedder: vector = [text.length % 7, 1, 0]; records calls. */
export function createFakeEmbedder(modelId = "fake/embed-3"): {
  calls: string[][];
  embedder: SearchEmbedder;
} {
  const calls: string[][] = [];
  const embedder = defineEmbedder(
    (texts) => {
      calls.push([...texts]);
      return Promise.resolve(texts.map((text) => [text.length % 7, 1, 0]));
    },
    { batch: true, dimensions: 3, maxBatchSize: 64, modelId }
  );
  return { calls, embedder };
}

export interface FakeTable {
  calls: { args: unknown[]; method: string }[];
  result: { data: unknown; error: { message: string } | null };
}

/**
 * Minimal chainable PostgREST fake. Every method records and returns the
 * builder; awaiting it resolves the configured result (thenable).
 */
export function createFakeSupabase(options?: {
  rpcData?: unknown;
  tables?: Record<string, unknown>;
}) {
  const tableCalls = new Map<string, FakeTable>();
  const rpc = {
    calls: [] as { args: Record<string, unknown>; fn: string }[],
    data: options?.rpcData ?? { matches: [], total: 0 },
  };

  function tableFor(name: string): FakeTable {
    let table = tableCalls.get(name);
    if (!table) {
      table = {
        calls: [],
        result: { data: options?.tables?.[name] ?? [], error: null },
      };
      tableCalls.set(name, table);
    }
    return table;
  }

  function builderFor(name: string) {
    const table = tableFor(name);
    const builder: Record<string, unknown> = {};
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        table.calls.push({ args, method });
        return builder;
      };
    for (const method of [
      "select",
      "eq",
      "in",
      "is",
      "gte",
      "order",
      "limit",
      "range",
      "delete",
      "upsert",
    ]) {
      builder[method] = record(method);
    }
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable Supabase query mock
    builder.then = (
      resolve: (value: FakeTable["result"]) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(table.result).then(resolve, reject);
    return builder;
  }

  const schemaApi = {
    from: (name: string) => builderFor(name),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpc.calls.push({ args, fn });
      return Promise.resolve({ data: rpc.data, error: null });
    },
  };

  return {
    rpc,
    schema: () => schemaApi,
    tableCalls,
    tableFor,
  };
}

export function makeDocument(
  overrides: Partial<RetrievalDocument> = {}
): RetrievalDocument {
  return {
    doc_id: "doc-1",
    source_id: "doc-1",
    source_type: "demo.item",
    source_updated_at: "2026-07-05T10:00:00Z",
    tenant_id: "tenant-1",
    text: "hello world",
    ...overrides,
  };
}

export function makeSource(
  overrides: Partial<RetrievalSourceRegistration> = {}
): RetrievalSourceRegistration {
  return {
    buildDocument: ({ doc_id }) =>
      Promise.resolve(makeDocument({ doc_id, source_id: doc_id })),
    listDocuments: () => Promise.resolve([]),
    module_id: "demo",
    operation: { entityName: "item" },
    source_type: "demo.item",
    splitter: { mode: "none" },
    visibility: "tenant",
    ...overrides,
  };
}
