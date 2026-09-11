// Generic catalog ranking: lexical BM25 plus optional embedding cosine.
//
// apps/ai owns embeddings (Gateway credentials). Callers supply records and
// an id function; without credentials — or on any embed failure — ranking
// degrades to lexical. Entry embeddings are cached by model + id + text
// fingerprint so as-you-type pickers do not re-embed a stable catalog.

import { createHash } from "node:crypto";
import {
  buildCatalogSearchText,
  type CatalogFieldWeights,
  type CatalogRankStrategy,
  type CatalogSearchEntry,
  cosineSimilarity,
  RECORD_CATALOG_FIELD_WEIGHTS,
  rankScoredCatalog,
  type ScoredCatalogItem,
  scoreCatalogEntry,
} from "@engenty/search-index";
import { createLogger } from "@engenty/telemetry";
import { embed, embedMany } from "ai";

const logger = createLogger({ name: "ai-catalog-record-ranking" });

export const DEFAULT_CATALOG_EMBEDDING_MODEL = "openai/text-embedding-3-small";
const CATALOG_EMBEDDING_VECTOR_DIM = 1536;

interface CatalogEmbeddingCacheEntry {
  embedding: number[];
  fingerprint: string;
}

const catalogEmbeddingCache = new Map<string, CatalogEmbeddingCacheEntry>();

export function clearCatalogRankingEmbeddingCache() {
  catalogEmbeddingCache.clear();
}

type CatalogEmbeddingProviderOptions = NonNullable<
  Parameters<typeof embedMany>[0]["providerOptions"]
>;

function catalogEmbeddingProviderOptions(
  modelId: string
): CatalogEmbeddingProviderOptions | undefined {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("google/")) {
    return {
      google: { outputDimensionality: CATALOG_EMBEDDING_VECTOR_DIM },
    };
  }
  if (lower === "openai/text-embedding-3-large") {
    return {
      openai: { dimensions: CATALOG_EMBEDDING_VECTOR_DIM },
    };
  }
  return;
}

function createFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function toNumberArray(vector: readonly number[]) {
  return Array.from(vector);
}

function resolveEmbeddingModel(modelId?: string) {
  return (
    modelId?.trim() ||
    process.env.ENGENTY_API_CATALOG_EMBEDDING_MODEL?.trim() ||
    DEFAULT_CATALOG_EMBEDDING_MODEL
  );
}

/**
 * Gateway-backed embeddings need either an API key or a Vercel OIDC token.
 * When neither is present, semantic/hybrid ranking falls back to lexical.
 */
export function hasCatalogGatewayCredentials(): boolean {
  return (
    Boolean(process.env.AI_GATEWAY_API_KEY?.trim()) ||
    Boolean(process.env.VERCEL_OIDC_TOKEN?.trim())
  );
}

async function embedQuery(params: {
  modelId: string;
  query: string;
}): Promise<number[]> {
  const providerOptions = catalogEmbeddingProviderOptions(params.modelId);
  const result = await embed(
    providerOptions === undefined
      ? { model: params.modelId, value: params.query }
      : {
          model: params.modelId,
          providerOptions,
          value: params.query,
        }
  );
  return toNumberArray(result.embedding as readonly number[]);
}

async function getEntryEmbeddings(params: {
  entries: Array<{ id: string; record: CatalogSearchEntry }>;
  modelId: string;
  weights: CatalogFieldWeights;
}): Promise<Map<string, number[]>> {
  const embeddingsById = new Map<string, number[]>();
  const missing: Array<{
    cacheKey: string;
    fingerprint: string;
    id: string;
    text: string;
  }> = [];

  for (const entry of params.entries) {
    const text = buildCatalogSearchText(entry.record, params.weights);
    const fingerprint = createFingerprint(text);
    const cacheKey = `${params.modelId}:${entry.id}`;
    const cached = catalogEmbeddingCache.get(cacheKey);
    if (cached?.fingerprint === fingerprint) {
      embeddingsById.set(entry.id, cached.embedding);
      continue;
    }
    missing.push({ cacheKey, fingerprint, id: entry.id, text });
  }

  if (missing.length > 0) {
    const providerOptions = catalogEmbeddingProviderOptions(params.modelId);
    const result = await embedMany(
      providerOptions === undefined
        ? {
            maxParallelCalls: 4,
            model: params.modelId,
            values: missing.map((item) => item.text),
          }
        : {
            maxParallelCalls: 4,
            model: params.modelId,
            providerOptions,
            values: missing.map((item) => item.text),
          }
    );
    result.embeddings.forEach((rawEmbedding, index) => {
      const missingEntry = missing[index];
      if (!missingEntry) {
        return;
      }
      const embedding = toNumberArray(rawEmbedding as readonly number[]);
      catalogEmbeddingCache.set(missingEntry.cacheKey, {
        embedding,
        fingerprint: missingEntry.fingerprint,
      });
      embeddingsById.set(missingEntry.id, embedding);
    });
  }

  return embeddingsById;
}

function asSearchEntry(entry: unknown): CatalogSearchEntry {
  return entry as CatalogSearchEntry;
}

export interface RankCatalogRecordsParams<T> {
  embeddingModel?: string;
  idOf: (entry: T) => string;
  minSemantic?: number;
  query: string;
  strategy?: CatalogRankStrategy;
  weights?: CatalogFieldWeights;
}

/**
 * Rank records for a query: lexical BM25 always, plus semantic cosine
 * similarity blended 0.65/0.35 for hybrid (semantic-only for `semantic`)
 * when gateway credentials are available.
 */
export async function rankCatalogRecords<T>(
  entries: T[],
  params: RankCatalogRecordsParams<T>
): Promise<ScoredCatalogItem<T>[]> {
  const query = params.query.trim();
  if (!query || entries.length === 0) {
    return entries.map((entry) => ({
      entry,
      lexical: 0,
      score: 0,
      semantic: 0,
    }));
  }

  const strategy = params.strategy ?? "hybrid";
  const weights = params.weights ?? RECORD_CATALOG_FIELD_WEIGHTS;
  const lexicalScores = entries.map((entry) =>
    scoreCatalogEntry(asSearchEntry(entry), query, weights)
  );
  const lexicallyRanked = rankScoredCatalog(
    entries.map((entry, index) => ({
      entry,
      lexical: lexicalScores[index] ?? 0,
      semantic: 0,
    })),
    "lexical"
  );
  if (strategy === "lexical" || !hasCatalogGatewayCredentials()) {
    return lexicallyRanked;
  }

  const modelId = resolveEmbeddingModel(params.embeddingModel);
  const identified = entries
    .map((entry) => ({
      id: params.idOf(entry),
      record: asSearchEntry(entry),
    }))
    .filter((entry) => entry.id.length > 0);
  let queryEmbedding: number[];
  let entryEmbeddings: Map<string, number[]>;
  try {
    [queryEmbedding, entryEmbeddings] = await Promise.all([
      embedQuery({ modelId, query }),
      getEntryEmbeddings({ entries: identified, modelId, weights }),
    ]);
  } catch (error) {
    logger.warn("Catalog embedding unavailable, falling back to lexical", {
      error: error instanceof Error ? error.message : String(error),
      modelId,
      strategy,
    });
    return lexicallyRanked;
  }

  return rankScoredCatalog(
    entries.map((entry, index) => {
      const id = params.idOf(entry);
      const semantic = id
        ? Math.max(
            0,
            cosineSimilarity(queryEmbedding, entryEmbeddings.get(id) ?? [])
          )
        : 0;
      return {
        entry,
        lexical: lexicalScores[index] ?? 0,
        semantic,
      };
    }),
    strategy,
    { minSemantic: params.minSemantic }
  );
}
