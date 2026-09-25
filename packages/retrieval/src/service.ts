// Service assembly: source registry, per-model embedder cache, lazy
// source-visibility registration (awaited before any read/write via ready()).
//
// One embedding model for every source: the host resolves it (the platform
// `embedding` role binding) and the service asks per call, so a rebind takes
// effect without a restart. Vectors from different models are not comparable,
// which is why no source can pick its own.

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
  /**
   * The model every source indexes and queries with — the platform
   * `embedding` role binding. Called per ingest/backfill/query/status; the
   * host caches.
   */
  resolveEmbeddingModel: () => Promise<string>;
  /** A plain client serves both lanes (tests/scripts); the handle pair runs
   * tenant work on the engenty_server lane (Phase A seam). */
  supabase: RetrievalDbSource;
}

export interface RetrievalServiceWithProviders extends RetrievalService {
  /** The embedding model currently in effect (admin display). */
  embeddingModel(): Promise<string>;
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

  async function embeddingModel(): Promise<string> {
    const modelId = (await options.resolveEmbeddingModel()).trim();
    if (!modelId) {
      throw new Error("No embedding model is bound to the embedding role");
    }
    return modelId;
  }

  async function resolveEmbedder(): Promise<SearchEmbedder> {
    const modelId = await embeddingModel();
    const existing = embedders.get(modelId);
    if (existing) {
      return existing;
    }
    const created = embedderFactory(modelId);
    embedders.set(modelId, created);
    return created;
  }

  const queryDeps: QueryDeps = {
    resolveEmbedder,
    sources,
    supabase,
  };

  function ingestDepsFor(source: RetrievalSourceRegistration): IngestDeps {
    return { resolveEmbedder, source, store };
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
    embeddingModel,
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
      const embedder = await resolveEmbedder();
      const { status } = await scanIndexState(source, store, tenantId, {
        embeddingModel: embedder.modelId,
      });
      return status;
    },
  };
}

export type { RetrievalQueryFilters } from "./contracts.js";
