// Shared lexical scoring for API-catalog-shaped entries.
//
// Extracted from apps/core's api-catalog search so both apps/core (the
// `core_api_catalog_search` gateway method, lexical-only) and apps/ai
// (the agent-facing catalog provider, which layers semantic reranking on
// top) score entries the same way. Entries are plain records; callers
// pick which fields matter via a weight list.

export type CatalogSearchEntry = Record<string, unknown>;

export type CatalogFieldWeights = ReadonlyArray<readonly [string, number]>;

interface CatalogSearchDocument {
  fields: { text: string; weight: number }[];
  tokens: string[];
}

// Default weights match the historical apps/core catalog ranking (entries
// produced by buildApiCatalog: HTTP routes + tool operations).
export const CATALOG_FIELD_WEIGHTS: CatalogFieldWeights = [
  ["id", 8],
  ["toolId", 10],
  ["moduleId", 7],
  ["pluginId", 6],
  ["title", 6],
  ["description", 4],
  ["tags", 3],
  ["path", 3],
  ["inputSchema", 2],
  ["outputSchema", 2],
  ["request", 1],
  ["response", 1],
];

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

export function tokenizeCatalogText(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

export function stringifyCatalogSearchValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(stringifyCatalogSearchValue).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(stringifyCatalogSearchValue)
      .filter(Boolean)
      .join(" ");
  }
  return String(value);
}

function buildSearchDocument(
  entry: CatalogSearchEntry,
  weights: CatalogFieldWeights
): CatalogSearchDocument {
  const fields = weights
    .map(([key, weight]) => ({
      text: stringifyCatalogSearchValue(entry[key]),
      weight,
    }))
    .filter((field) => field.text.length > 0);
  const tokens = fields.flatMap((field) => tokenizeCatalogText(field.text));
  return { fields, tokens };
}

/**
 * Weighted "key: value" text for an entry — the canonical input for
 * embedding an entry when a consumer layers semantic search on top.
 */
export function buildCatalogSearchText(
  entry: CatalogSearchEntry,
  weights: CatalogFieldWeights = CATALOG_FIELD_WEIGHTS
): string {
  return weights
    .map(([key]) => {
      const value = stringifyCatalogSearchValue(entry[key]);
      return value ? `${key}: ${value}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function tokenFrequency(tokens: string[], token: string) {
  return tokens.reduce((count, item) => count + (item === token ? 1 : 0), 0);
}

/** BM25-like weighted-field lexical score; 0 when the query has no overlap. */
export function scoreCatalogEntry(
  entry: CatalogSearchEntry,
  query?: string,
  weights: CatalogFieldWeights = CATALOG_FIELD_WEIGHTS
): number {
  if (!query?.trim()) {
    return 0;
  }

  const queryTokens = tokenizeCatalogText(query);
  if (queryTokens.length === 0) {
    return 0;
  }

  const document = buildSearchDocument(entry, weights);
  if (document.tokens.length === 0) {
    return 0;
  }

  return queryTokens.reduce((score, token) => {
    const termFrequency = tokenFrequency(document.tokens, token);
    if (termFrequency === 0) {
      return score;
    }

    const fieldScore = document.fields.reduce((sum, field) => {
      const fieldTokens = tokenizeCatalogText(field.text);
      const fieldFrequency = tokenFrequency(fieldTokens, token);
      if (fieldFrequency === 0) {
        return sum;
      }
      const bm25Like =
        (fieldFrequency * 2.2) /
        (fieldFrequency + 1.2 + fieldTokens.length / 16);
      return sum + field.weight * bm25Like;
    }, 0);

    return score + fieldScore;
  }, 0);
}

/** Sort entries by precomputed lexical score, dropping zero-score entries. */
export function rankLexically<T extends CatalogSearchEntry>(
  entries: T[],
  lexicalScores: number[]
): T[] {
  return entries
    .map((entry, index) => ({
      entry,
      score: lexicalScores[index] ?? 0,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry);
}
