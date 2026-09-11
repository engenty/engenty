// Shared hybrid ranking for catalog-shaped records.
//
// Lexical BM25 lives in catalog-lexical.ts. This module blends those scores
// with cosine similarity when a consumer (apps/ai today) supplies embeddings.
// UI pickers can call rankScoredCatalog with semantic=0 for lexical-only.

import {
  type CatalogFieldWeights,
  type CatalogSearchEntry,
  scoreCatalogEntry,
} from "./catalog-lexical.js";

export type CatalogRankStrategy = "hybrid" | "lexical" | "semantic";

/** Name/description records (space modules, skills, connections, agents). */
export const RECORD_CATALOG_FIELD_WEIGHTS: CatalogFieldWeights = [
  ["name", 10],
  ["id", 8],
  ["title", 6],
  ["summary", 6],
  ["description", 6],
  ["category", 5],
  ["modules", 4],
  ["connectorId", 4],
  ["role", 3],
  ["tags", 3],
  ["source", 2],
];

/**
 * Rank name/description records by lexical BM25 (prefix + inflection).
 * Empty query keeps input order; zero-score rows drop out.
 */
export function rankRecordsLexically<T>(
  items: readonly T[],
  query: string,
  toRecord: (item: T) => CatalogSearchEntry,
  weights: CatalogFieldWeights = RECORD_CATALOG_FIELD_WEIGHTS
): T[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [...items];
  }
  return items
    .map((item) => ({
      item,
      score: scoreCatalogEntry(toRecord(item), trimmed, weights),
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((row) => row.item);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < length; index += 1) {
    const aValue = a[index] ?? 0;
    const bValue = b[index] ?? 0;
    dot += aValue * bValue;
    left += aValue * aValue;
    right += bValue * bValue;
  }
  const denominator = Math.sqrt(left) * Math.sqrt(right);
  if (denominator === 0) {
    return 0;
  }
  return dot / denominator;
}

export function blendCatalogScores(params: {
  lexical: number;
  maxLexical: number;
  semantic: number;
  strategy: CatalogRankStrategy;
}): number {
  if (params.strategy === "lexical") {
    return params.lexical;
  }
  if (params.strategy === "semantic") {
    return params.semantic;
  }
  const normalizedLexical =
    params.maxLexical > 0 ? params.lexical / params.maxLexical : 0;
  return params.semantic * 0.65 + normalizedLexical * 0.35;
}

export interface ScoredCatalogItem<T> {
  entry: T;
  lexical: number;
  score: number;
  semantic: number;
}

/**
 * Sort catalog rows by blended score. Lexical hits always survive; semantic
 * hits need to clear `minSemantic` (default 0 means any cosine > 0).
 */
export function rankScoredCatalog<T>(
  items: ReadonlyArray<{ entry: T; lexical: number; semantic: number }>,
  strategy: CatalogRankStrategy,
  options: { minSemantic?: number } = {}
): ScoredCatalogItem<T>[] {
  const minSemantic = options.minSemantic ?? 0;
  const maxLexical = Math.max(...items.map((item) => item.lexical), 0);
  return items
    .map((item) => ({
      entry: item.entry,
      lexical: item.lexical,
      score: blendCatalogScores({
        lexical: item.lexical,
        maxLexical,
        semantic: item.semantic,
        strategy,
      }),
      semantic: item.semantic,
    }))
    .filter((item) => {
      if (strategy === "lexical") {
        return item.lexical > 0;
      }
      if (strategy === "semantic") {
        return item.semantic > minSemantic;
      }
      return item.lexical > 0 || item.semantic > minSemantic;
    })
    .sort((a, b) => b.score - a.score);
}
