// Opt-in Mastra semantic recall (vector RAG over chat turns). Off by default:
// enabling embeds on every save and every chat turn. Thread-scoped only.

import { resolvePlatformEmbeddingModelId } from "@engenty/ai-core";
import type { MastraVector } from "@mastra/core/vector";
import { PgVector } from "@mastra/pg";
import {
  isWorkspaceVectorSearchConfigured,
  resolveVectorDbUrl,
} from "../workspace/workspace-search.js";

export const MEMORY_MESSAGE_VECTOR_STORE_ID = "engenty-memory-messages";

export function semanticRecallEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    env.ENGENTY_AI_SEMANTIC_RECALL === "true" &&
    isWorkspaceVectorSearchConfigured()
  );
}

export function createSemanticRecallBindings(
  env: NodeJS.ProcessEnv = process.env
): {
  embedder: string;
  vector: MastraVector;
} | null {
  if (!semanticRecallEnabled(env)) {
    return null;
  }
  const connectionString = resolveVectorDbUrl();
  if (!connectionString) {
    return null;
  }
  return {
    // The `embedding` role, read per memory: the snapshot loads after boot.
    embedder: resolvePlatformEmbeddingModelId(),
    vector: new PgVector({
      connectionString,
      id: MEMORY_MESSAGE_VECTOR_STORE_ID,
    }) as MastraVector,
  };
}
