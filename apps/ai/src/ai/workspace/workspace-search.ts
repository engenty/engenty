// Optional hybrid (BM25 + vector) workspace search wiring. Vector/semantic
// search activates only when BOTH the embedding env (AI Gateway) and a Postgres
// connection for pgvector are configured — a config gate, not a runtime
// fallback. When unconfigured, the loader runs BM25-only.
//
// The pgvector index is keyed by a stable per-tenant `searchIndexName`, so the
// ephemeral per-run workspace reuses a persisted index rather than re-embedding
// on every run. `@mastra/pg` is imported lazily so the dependency only loads
// when vector search is actually enabled.

import type { MastraVector } from "@mastra/core/vector";
import { embedMany } from "ai";

// AI Gateway embedding model id (text-embedding-3-small → 1536 dims).
const WORKSPACE_EMBEDDING_MODEL = "openai/text-embedding-3-small";
const WORKSPACE_EMBEDDING_MAX_BATCH = 256;

// Structural match for Mastra's `BatchEmbedder` (not re-exported from the
// `@mastra/core/workspace` entry, so we model it locally and rely on structural
// compatibility when passing it to the Workspace `embedder` option).
export type WorkspaceBatchEmbedder = ((
  texts: string[]
) => Promise<number[][]>) & {
  readonly batch: true;
  readonly maxBatchSize?: number;
};

export interface WorkspaceVectorSearch {
  embedder: WorkspaceBatchEmbedder;
  vectorStore: MastraVector;
}

function resolveVectorDbUrl(): string | undefined {
  return (
    process.env.ENGENTY_WORKSPACE_VECTOR_DB_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    undefined
  );
}

function gatewayEmbeddingsConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
}

export function isWorkspaceVectorSearchConfigured(): boolean {
  return Boolean(resolveVectorDbUrl()) && gatewayEmbeddingsConfigured();
}

function createGatewayBatchEmbedder(): WorkspaceBatchEmbedder {
  const embedder = async (texts: string[]): Promise<number[][]> => {
    const { embeddings } = await embedMany({
      maxParallelCalls: 4,
      model: WORKSPACE_EMBEDDING_MODEL,
      values: texts,
    });
    return embeddings.map(
      (raw) => Array.from(raw as readonly number[]) as number[]
    );
  };
  return Object.assign(embedder, {
    batch: true as const,
    maxBatchSize: WORKSPACE_EMBEDDING_MAX_BATCH,
  });
}

// Returns the vector store + embedder when env-configured, else null (BM25-only).
export async function buildWorkspaceVectorSearch(): Promise<WorkspaceVectorSearch | null> {
  const connectionString = resolveVectorDbUrl();
  if (!(connectionString && gatewayEmbeddingsConfigured())) {
    return null;
  }
  const { PgVector } = await import("@mastra/pg");
  const vectorStore = new PgVector({
    connectionString,
    id: "engenty-workspace-skills",
  }) as MastraVector;
  return { embedder: createGatewayBatchEmbedder(), vectorStore };
}
