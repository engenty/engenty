// Semantic + hybrid ranking for the agent-facing API catalog.
//
// Moved from apps/core (schema-split follow-up): core builds the catalog and
// ranks lexically; apps/ai — which already runs models and holds the AI
// Gateway credentials — layers query/entry embeddings on top of the shared
// lexical scoring from @engenty/search-index. Without gateway credentials
// (or on any embedding failure) ranking degrades to lexical.

import { createHash } from "node:crypto";
import {
  buildCatalogSearchText,
  type CatalogFieldWeights,
  scoreCatalogEntry,
} from "@engenty/search-index";
import { createLogger } from "@engenty/telemetry";
import { embed, embedMany } from "ai";
import type { EngentyToolContract } from "../../ai/core-http-client.js";

const logger = createLogger({ name: "ai-api-catalog-ranking" });

export type CatalogRankStrategy = "lexical" | "semantic" | "hybrid";

// Contract-shaped weights: `EngentyToolContract` carries `summary` (not
// `title`) and has no path/tags. `methodName` stays excluded — it's an
// internal handler id callers should not have to think about.
export const CONTRACT_FIELD_WEIGHTS: CatalogFieldWeights = [
  ["toolId", 10],
  ["operationId", 8],
  ["moduleId", 7],
  ["pluginId", 6],
  ["summary", 6],
  ["description", 4],
  ["inputSchema", 2],
  ["outputSchema", 2],
];

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

function dotProduct(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += a[index] * b[index];
  }
  return total;
}

function magnitude(vector: number[]) {
  return Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
}

function cosineSimilarity(a: number[], b: number[]) {
  const denominator = magnitude(a) * magnitude(b);
  if (denominator === 0) {
    return 0;
  }
  return dotProduct(a, b) / denominator;
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
function hasGatewayCredentials(): boolean {
  return (
    Boolean(process.env.AI_GATEWAY_API_KEY?.trim()) ||
    Boolean(process.env.VERCEL_OIDC_TOKEN?.trim())
  );
}

function contractId(contract: EngentyToolContract): string {
  return contract.toolId ?? contract.operationId ?? contract.methodName ?? "";
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

async function getContractEmbeddings(params: {
  contracts: EngentyToolContract[];
  modelId: string;
}): Promise<Map<string, number[]>> {
  const embeddingsById = new Map<string, number[]>();
  const missing: Array<{
    cacheKey: string;
    fingerprint: string;
    id: string;
    text: string;
  }> = [];

  for (const contract of params.contracts) {
    const id = contractId(contract);
    if (!id) {
      continue;
    }
    const text = buildCatalogSearchText(
      contract as Record<string, unknown>,
      CONTRACT_FIELD_WEIGHTS
    );
    const fingerprint = createFingerprint(text);
    const cacheKey = `${params.modelId}:${id}`;
    const cached = catalogEmbeddingCache.get(cacheKey);
    if (cached?.fingerprint === fingerprint) {
      embeddingsById.set(id, cached.embedding);
      continue;
    }
    missing.push({ cacheKey, fingerprint, id, text });
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

export interface RankedContract {
  contract: EngentyToolContract;
  lexical: number;
  score: number;
  semantic: number;
}

export interface RankContractsParams {
  embeddingModel?: string;
  query: string;
  strategy?: CatalogRankStrategy;
}

function rankContractsLexically(
  contracts: EngentyToolContract[],
  lexicalScores: number[]
): RankedContract[] {
  return contracts
    .map((contract, index) => ({
      contract,
      lexical: lexicalScores[index] ?? 0,
      score: lexicalScores[index] ?? 0,
      semantic: 0,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Rank contracts for a query: lexical BM25 always, plus semantic cosine
 * similarity blended 0.65/0.35 for hybrid (semantic-only for `semantic`)
 * when gateway credentials are available.
 */
export async function rankContracts(
  contracts: EngentyToolContract[],
  params: RankContractsParams
): Promise<RankedContract[]> {
  const query = params.query.trim();
  if (!query || contracts.length === 0) {
    return contracts.map((contract) => ({
      contract,
      lexical: 0,
      score: 0,
      semantic: 0,
    }));
  }

  const strategy = params.strategy ?? "hybrid";
  const lexicalScores = contracts.map((contract) =>
    scoreCatalogEntry(
      contract as Record<string, unknown>,
      query,
      CONTRACT_FIELD_WEIGHTS
    )
  );
  if (strategy === "lexical" || !hasGatewayCredentials()) {
    return rankContractsLexically(contracts, lexicalScores);
  }

  const modelId = resolveEmbeddingModel(params.embeddingModel);
  let queryEmbedding: number[];
  let contractEmbeddings: Map<string, number[]>;
  try {
    [queryEmbedding, contractEmbeddings] = await Promise.all([
      embedQuery({ modelId, query }),
      getContractEmbeddings({ contracts, modelId }),
    ]);
  } catch (error) {
    logger.warn("Catalog embedding unavailable, falling back to lexical", {
      error: error instanceof Error ? error.message : String(error),
      modelId,
      strategy,
    });
    return rankContractsLexically(contracts, lexicalScores);
  }

  const maxLexicalScore = Math.max(...lexicalScores, 0);
  const scored: RankedContract[] = contracts.map((contract, index) => {
    const id = contractId(contract);
    const semantic = id
      ? Math.max(
          0,
          cosineSimilarity(queryEmbedding, contractEmbeddings.get(id) ?? [])
        )
      : 0;
    const lexical = lexicalScores[index] ?? 0;
    const normalizedLexical =
      maxLexicalScore > 0 ? lexical / maxLexicalScore : 0;
    const score =
      strategy === "semantic"
        ? semantic
        : semantic * 0.65 + normalizedLexical * 0.35;
    return { contract, lexical, score, semantic };
  });

  return scored
    .filter((item) =>
      strategy === "semantic"
        ? item.semantic > 0
        : item.semantic > 0 || item.lexical > 0
    )
    .sort((a, b) => b.score - a.score);
}
