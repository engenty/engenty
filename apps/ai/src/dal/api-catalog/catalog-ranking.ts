// Semantic + hybrid ranking for the agent-facing API catalog.
//
// Moved from apps/core (schema-split follow-up): core builds the catalog and
// ranks lexically; apps/ai — which already runs models and holds the AI
// Gateway credentials — layers query/entry embeddings on top of the shared
// lexical scoring from @engenty/search-index. Generic record ranking lives in
// catalog-record-ranking.ts so space pickers can reuse the same path.

import type {
  CatalogFieldWeights,
  CatalogRankStrategy,
} from "@engenty/search-index";
import type { EngentyToolContract } from "../../ai/core-http-client.js";
import { rankCatalogRecords } from "./catalog-record-ranking.js";

export {
  clearCatalogRankingEmbeddingCache,
  DEFAULT_CATALOG_EMBEDDING_MODEL,
} from "./catalog-record-ranking.js";

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

function contractId(contract: EngentyToolContract): string {
  return contract.toolId ?? contract.operationId ?? contract.methodName ?? "";
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

/**
 * Rank contracts for a query: lexical BM25 always, plus semantic cosine
 * similarity blended 0.65/0.35 for hybrid (semantic-only for `semantic`)
 * when gateway credentials are available.
 */
export async function rankContracts(
  contracts: EngentyToolContract[],
  params: RankContractsParams
): Promise<RankedContract[]> {
  const ranked = await rankCatalogRecords(contracts, {
    embeddingModel: params.embeddingModel,
    idOf: contractId,
    query: params.query,
    strategy: params.strategy,
    weights: CONTRACT_FIELD_WEIGHTS,
  });
  return ranked.map((item) => ({
    contract: item.entry,
    lexical: item.lexical,
    score: item.score,
    semantic: item.semantic,
  }));
}
