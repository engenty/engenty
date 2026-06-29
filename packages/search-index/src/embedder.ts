// Stable embedder protocol shared across providers.
//
// An `SearchEmbedder` is just a function with metadata properties — modeled
// after Mastra's `Object.assign(fn, { batch: true, maxBatchSize })`. The host
// uses `embedTexts` to dispatch a single call vs. parallel batched calls
// based on the embedder's declared `maxBatchSize`. `dimensions` and
// `modelId` move dimension assertions and telemetry into the package so the
// per-module `embed*ForX` helpers can collapse.

export interface SearchEmbedder {
  // Marks the function as a true batched embedder; defaults are sequential.
  batch?: true;
  // Required: vector dimension produced by `modelId`.
  dimensions: number;
  // Provider's max batch size. When unset, all texts are sent in one call.
  maxBatchSize?: number;
  // Stable model identifier (e.g. `"openai/text-embedding-3-small"`).
  modelId: string;
  (texts: string[]): Promise<number[][]>;
}

export interface DefineEmbedderOptions {
  batch?: boolean;
  dimensions: number;
  maxBatchSize?: number;
  modelId: string;
}

export function defineEmbedder(
  fn: (texts: string[]) => Promise<number[][]>,
  options: DefineEmbedderOptions
): SearchEmbedder {
  if (!Number.isInteger(options.dimensions) || options.dimensions <= 0) {
    throw new Error("SearchEmbedder dimensions must be a positive integer");
  }
  if (!options.modelId.trim()) {
    throw new Error("SearchEmbedder modelId is required");
  }
  if (
    options.maxBatchSize !== undefined &&
    (!Number.isInteger(options.maxBatchSize) || options.maxBatchSize <= 0)
  ) {
    throw new Error("SearchEmbedder maxBatchSize must be a positive integer");
  }
  const embedder = fn as SearchEmbedder;
  embedder.dimensions = options.dimensions;
  embedder.modelId = options.modelId;
  if (options.batch === true) {
    embedder.batch = true;
  }
  if (options.maxBatchSize !== undefined) {
    embedder.maxBatchSize = options.maxBatchSize;
  }
  return embedder;
}

export async function embedTexts(
  embedder: SearchEmbedder,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  const max = embedder.maxBatchSize;
  if (!max || texts.length <= max) {
    return embedder(texts);
  }
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += max) {
    batches.push(texts.slice(i, i + max));
  }
  const results = await Promise.all(batches.map((batch) => embedder(batch)));
  return results.flat();
}

export function assertEmbeddingDimensions(
  embedder: SearchEmbedder,
  vec: readonly number[]
): void {
  if (vec.length !== embedder.dimensions) {
    throw new Error(
      `Embedding dimension mismatch: ${embedder.modelId} expects ${embedder.dimensions}, got ${vec.length}`
    );
  }
}
