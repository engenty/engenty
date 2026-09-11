// Opt-in Mastra semantic recall (vector RAG over chat turns). Off by default:
// enabling embeds on every save and every chat turn. Thread-scoped only.

import type { MastraVector } from "@mastra/core/vector";
import { PgVector } from "@mastra/pg";
import {
  isWorkspaceVectorSearchConfigured,
  resolveVectorDbUrl,
} from "../workspace/workspace-search.js";

export const MEMORY_MESSAGE_VECTOR_STORE_ID = "engenty-memory-messages";
export const MEMORY_MESSAGE_EMBEDDER = "openai/text-embedding-3-small";

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
    embedder: MEMORY_MESSAGE_EMBEDDER,
    vector: new PgVector({
      connectionString,
      id: MEMORY_MESSAGE_VECTOR_STORE_ID,
    }) as MastraVector,
  };
}
