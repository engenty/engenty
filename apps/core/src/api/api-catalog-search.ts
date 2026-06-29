import { createHash } from "node:crypto";
import { createLogger } from "@engenty/telemetry";
import { embed, embedMany } from "ai";

const logger = createLogger({ name: "api-catalog-search" });

type CatalogSearchEntry = Record<string, unknown>;

interface SearchDocument {
  fields: { text: string; weight: number }[];
  tokens: string[];
}

export type CatalogSearchStrategy = "lexical" | "semantic" | "hybrid";

interface CatalogEmbeddingCacheEntry {
  embedding: number[];
  fingerprint: string;
}

interface CatalogRankParams {
  embeddingModel?: string;
  query?: string;
  strategy?: CatalogSearchStrategy;
}

interface CatalogScore {
  entry: CatalogSearchEntry;
  lexical: number;
  score: number;
  semantic: number;
}

export const DEFAULT_CATALOG_EMBEDDING_MODEL = "openai/text-embedding-3-small";
const CATALOG_EMBEDDING_VECTOR_DIM = 1536;
const catalogEmbeddingCache = new Map<string, CatalogEmbeddingCacheEntry>();

const FIELD_WEIGHTS: [string, number][] = [
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

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function stringifySearchValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(stringifySearchValue).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(stringifySearchValue)
      .filter(Boolean)
      .join(" ");
  }
  return String(value);
}

function createFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildSearchDocument(entry: CatalogSearchEntry): SearchDocument {
  const fields = FIELD_WEIGHTS.map(([key, weight]) => ({
    text: stringifySearchValue(entry[key]),
    weight,
  })).filter((field) => field.text.length > 0);
  const tokens = fields.flatMap((field) => tokenize(field.text));
  return { fields, tokens };
}

function buildCatalogSearchText(entry: CatalogSearchEntry): string {
  return FIELD_WEIGHTS.map(([key]) => {
    const value = stringifySearchValue(entry[key]);
    return value ? `${key}: ${value}` : "";
  })
    .filter(Boolean)
    .join("\n");
}

function tokenFrequency(tokens: string[], token: string) {
  return tokens.reduce((count, item) => count + (item === token ? 1 : 0), 0);
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
  entries: CatalogSearchEntry[];
  modelId: string;
}): Promise<Map<string, number[]>> {
  const embeddingsById = new Map<string, number[]>();
  const missing: Array<{
    cacheKey: string;
    fingerprint: string;
    id: string;
    text: string;
  }> = [];

  for (const entry of params.entries) {
    const id = stringifySearchValue(entry.id);
    if (!id) {
      continue;
    }
    const text = buildCatalogSearchText(entry);
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

export function scoreCatalogEntry(
  entry: CatalogSearchEntry,
  query?: string
): number {
  if (!query?.trim()) {
    return 0;
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return 0;
  }

  const document = buildSearchDocument(entry);
  if (document.tokens.length === 0) {
    return 0;
  }

  return queryTokens.reduce((score, token) => {
    const termFrequency = tokenFrequency(document.tokens, token);
    if (termFrequency === 0) {
      return score;
    }

    const fieldScore = document.fields.reduce((sum, field) => {
      const fieldTokens = tokenize(field.text);
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

export function clearCatalogSearchEmbeddingCache() {
  catalogEmbeddingCache.clear();
}

function rankLexically<T extends CatalogSearchEntry>(
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

  const strategy = params.strategy ?? "hybrid";
  const lexicalScores = entries.map((entry) => scoreCatalogEntry(entry, query));
  if (strategy === "lexical") {
    return rankLexically(entries, lexicalScores);
  }

  const modelId = resolveEmbeddingModel(params.embeddingModel);
  let queryEmbedding: number[];
  let entryEmbeddings: Map<string, number[]>;
  try {
    [queryEmbedding, entryEmbeddings] = await Promise.all([
      embedQuery({ modelId, query }),
      getEntryEmbeddings({ entries, modelId }),
    ]);
  } catch (error) {
    logger.warn("Catalog embedding unavailable, falling back to lexical", {
      error: error instanceof Error ? error.message : String(error),
      modelId,
      strategy,
    });
    return rankLexically(entries, lexicalScores);
  }
  const maxLexicalScore = Math.max(...lexicalScores, 0);
  const scores: CatalogScore[] = entries.map((entry, index) => {
    const id = stringifySearchValue(entry.id);
    const semantic = id
      ? Math.max(
          0,
          cosineSimilarity(queryEmbedding, entryEmbeddings.get(id) ?? [])
        )
      : 0;
    const lexical = lexicalScores[index] ?? 0;
    const normalizedLexical =
      maxLexicalScore > 0 ? lexical / maxLexicalScore : 0;
    const score =
      strategy === "semantic"
        ? semantic
        : semantic * 0.65 + normalizedLexical * 0.35;
    return { entry, lexical, score, semantic };
  });

  return scores
    .filter((item) =>
      strategy === "semantic"
        ? item.semantic > 0
        : item.semantic > 0 || item.lexical > 0
    )
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry as T);
}
