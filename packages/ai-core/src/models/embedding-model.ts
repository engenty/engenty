/**
 * The platform `embedding` role: the one source of the model every search
 * index, catalog ranking and vector lookup embeds with. Platform-wide — there
 * is no tenant override, because vectors from different models are not
 * comparable and every tenant shares the same index tables.
 */
import { parseModelRef } from "../config/model-ref.js";
import { roleModelRef } from "../config/platform-bindings.js";

export const EMBEDDING_MODEL_ROLE = "embedding";

/**
 * The model id the `embedding` role is bound to, without a gateway head: embeddings always run on the default
 * gateway (see `installGatewayAwareDefaultProvider`), and the bare id is what
 * the search index records per chunk.
 */
export function resolvePlatformEmbeddingModelId(): string {
  return parseModelRef(roleModelRef(EMBEDDING_MODEL_ROLE)).modelId;
}
