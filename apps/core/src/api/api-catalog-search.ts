// Lexical ranking for the core API catalog.
//
// Semantic/hybrid ranking moved to apps/ai (the agent-facing catalog
// provider layers embeddings over the contracts it fetches from core), so
// core no longer calls embedding models or needs gateway credentials.
// `semantic`/`hybrid` strategy requests are accepted for compatibility and
// rank lexically.

import {
  type CatalogSearchEntry,
  rankLexically,
  scoreCatalogEntry,
} from "@engenty/search-index";

export { scoreCatalogEntry } from "@engenty/search-index";

export type CatalogSearchStrategy = "lexical" | "semantic" | "hybrid";

interface CatalogRankParams {
  query?: string;
  strategy?: CatalogSearchStrategy;
}

export async function rankCatalogEntries<T extends CatalogSearchEntry>(
  entries: T[],
  params: CatalogRankParams
): Promise<T[]> {
  const query = params.query?.trim();
  if (!query) {
    return entries;
  }
  if (entries.length === 0) {
    return [];
  }
  const lexicalScores = entries.map((entry) => scoreCatalogEntry(entry, query));
  return rankLexically(entries, lexicalScores);
}
