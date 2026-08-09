// Service assembly: source registry, per-model embedder cache, lazy
// source-visibility registration (awaited before any read/write via ready()).

import type {
  SearchEmbedder,
  SearchIndexProvider,
} from "@engenty/search-index";
import { runBackfill } from "./backfill.js";
import type {
  RetrievalBackfillInput,
  RetrievalBackfillResult,
  RetrievalService,
  RetrievalSourceRegistration,
} from "./contracts.js";
import { DEFAULT_RETRIEVAL_EMBEDDING_MODEL } from "./contracts.js";
import { createAiSdkEmbedder } from "./embedder-ai.js";
import type { IngestDeps } from "./ingest.js";
import { ingestById } from "./ingest.js";
import { createManagedProvider } from "./provider-factory.js";
import { type QueryDeps, runQuery } from "./query.js";
import { scanIndexState } from "./status.js";
import { createRetrievalStore, type RetrievalDbSource } from "./store.js";

export interface CreateRetrievalServiceOptions {
  /** Test seam: swap the embedder factory (unit tests inject deterministic vectors). */
  createEmbedder?: (modelId: string) => SearchEmbedder;
  /** A plain client serves both lanes (tests/scripts); the handle pair runs
   * tenant work on the engenty_server lane (Phase A seam). */
  supabase: RetrievalDbSource;
}

export interface RetrievalServiceWithProviders extends RetrievalService {
  /** Manufactured provider for a registered source (for registry wiring). */
  getProvider(
    source_type: string
  ): SearchIndexProvider<never, never, unknown> | null;
  listSources(): RetrievalSourceRegistration[];
}

export function createRetrievalService(
  options: CreateRetrievalServiceOptions
): RetrievalServiceWithProviders {
  const { supabase } = options;
  const store = createRetrievalStore(supabase);
  const sources = new Map<string, RetrievalSourceRegistration>();
  const providers = new Map<
    string,
    SearchIndexProvider<never, never, unknown>
  >();
  const embedders = new Map<string, SearchEmbedder>();
  const visibilityRegistrations: Promise<void>[] = [];
  const embedderFactory =
    options.createEmbedder ??
    ((modelId: string) => createAiSdkEmbedder({ modelId }));

  function embedderFor(modelId: string): SearchEmbedder {
    const existing = embedders.get(modelId);
    if (existing) {
      return existing;
    }
    const created = embedderFactory(modelId);
    embedders.set(modelId, created);
    return created;
  }

  async function resolveEmbedder(
    source: RetrievalSourceRegistration,
    tenantId: string
  ): Promise<SearchEmbedder> {
    const model = source.embedding?.resolveModel
      ? await source.embedding.resolveModel(tenantId)
      : (source.embedding?.model ?? DEFAULT_RETRIEVAL_EMBEDDING_MODEL);
    return embedderFor(model.trim() || DEFAULT_RETRIEVAL_EMBEDDING_MODEL);
  }

  // Multi-source queries embed once. When targeted sources resolve to
  // different models the FIRST source's model wins and mismatched-model
  // chunks score lexical-only in the RPC (see query.ts model honesty note).
  async function resolveEmbedderForSources(
    targeted: RetrievalSourceRegistration[],
    tenantId: string
  ): Promise<SearchEmbedder> {
    const first = targeted[0];
    if (!first) {
      return embedderFor(DEFAULT_RETRIEVAL_EMBEDDING_MODEL);
    }
    return resolveEmbedder(first, tenantId);
  }

  const queryDeps: QueryDeps = {
    resolveEmbedderForSources,
    sources,
    supabase,
  };

  function ingestDepsFor(source: RetrievalSourceRegistration): IngestDeps {
    return {
      resolveEmbedder: (tenantId) => resolveEmbedder(source, tenantId),
      source,
      store,
    };
  }

  async function ready(): Promise<void> {
    await Promise.all(visibilityRegistrations);
  }

  function requireSource(sourceType: string): RetrievalSourceRegistration {
    const source = sources.get(sourceType);
    if (!source) {
      throw new Error(`Unknown retrieval source: ${sourceType}`);
    }
    return source;
  }

  return {
    backfill: async (
      sourceType: string,
      input: RetrievalBackfillInput
    ): Promise<RetrievalBackfillResult> => {
      await ready();
      return runBackfill(ingestDepsFor(requireSource(sourceType)), input);
    },
    getProvider: (sourceType) => providers.get(sourceType) ?? null,
    ingest: async (input) => {
      await ready();
      const source = requireSource(input.source_type);
      await ingestById(ingestDepsFor(source), {
        doc_id: input.doc_id,
        tenant_id: input.tenant_id,
      });
    },
    listSources: () => Array.from(sources.values()),
    registerSource: (registration) => {
      // Re-registration replaces (dev plugin reload re-runs module factories;
      // the manufactured provider is rebuilt against the fresh closures).
      sources.set(registration.source_type, registration);
      const visibilityTask = store.registerSourceVisibility(
        registration.source_type,
        registration.module_id,
        registration.visibility
      );
      // Boot registers sources before anything awaits `ready()`; attach a
      // handler so a failed visibility upsert is not an unhandled rejection
      // while tests or partial startup skip retrieval reads.
      visibilityTask.catch(() => {});
      visibilityRegistrations.push(visibilityTask);
      providers.set(
        registration.source_type,
        createManagedProvider(registration, {
          ingest: ingestDepsFor(registration),
          query: queryDeps,
          ready,
        }) as SearchIndexProvider<never, never, unknown>
      );
    },
    remove: async (input) => {
      await ready();
      requireSource(input.source_type);
      await store.deleteDocument({
        docId: input.doc_id,
        sourceType: input.source_type,
        tenantId: input.tenant_id,
      });
    },
    search: async (request) => {
      await ready();
      return runQuery(queryDeps, request);
    },
    status: async (sourceType, input) => {
      await ready();
      const source = requireSource(sourceType);
      const tenantId = input.tenant_id?.trim();
      if (!tenantId) {
        return {
          current_count: 0,
          indexed_count: 0,
          last_indexed_at: null,
          missing_count: 0,
          stale_count: 0,
          total_count: 0,
        };
      }
      const { status } = await scanIndexState(source, store, tenantId);
      return status;
    },
  };
}

export type { RetrievalQueryFilters } from "./contracts.js";
