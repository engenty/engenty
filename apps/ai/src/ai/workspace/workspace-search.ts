// Vector-store configuration shared by the opt-in Mastra semantic recall
// (see memory/semantic-recall.ts): a Postgres connection for pgvector plus
// AI Gateway credentials — a config gate, not a runtime fallback.

export function resolveVectorDbUrl(): string | undefined {
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
