import { z } from "zod";

/* ── KB Chunking (per-KB, stored in kb_settings KV `kb.chunking` with `context.kb_id`) ── */

export const KB_CHUNK_STRATEGIES = [
  "recursive",
  "character",
  "token",
  "markdown",
  "html",
  "json",
  "sentence",
  "semantic-markdown",
] as const;

export type KbChunkStrategy = (typeof KB_CHUNK_STRATEGIES)[number];

/**
 * How one knowledge base's articles are split before embedding. Content-shaped
 * (a handbook of long chapters wants different windows than a FAQ list), so it
 * belongs to the library, not the tenant. A library without its own row uses
 * `KB_CHUNKING_DEFAULTS`.
 */
export interface KbChunking {
  /** Maximum character length of each chunk for embedding. */
  max_length: number;
  /** Character overlap between consecutive chunks. */
  overlap: number;
  /** Chunking strategy used by @mastra/rag MDocument.chunk(). */
  strategy: KbChunkStrategy;
}

export const KB_CHUNKING_DEFAULTS: KbChunking = {
  max_length: 1000,
  overlap: 100,
  strategy: "recursive",
};

export const kbChunkingSchema = z.object({
  max_length: z.number().int().min(100).max(8000),
  overlap: z.number().int().min(0).max(2000),
  strategy: z.enum(KB_CHUNK_STRATEGIES),
});
