// Ingestion pipeline: buildDocument → split → embed (batched) → upsert.
// Null/empty documents delete the index entry. Called from the manufactured
// provider's replaceDocument/deleteDocument (event path) and from backfill.

import { embedTexts, type SearchEmbedder } from "@engenty/search-index";
import type {
  RetrievalDocument,
  RetrievalSourceRegistration,
} from "./contracts.js";
import { splitDocument } from "./splitter.js";
import type { RetrievalStore } from "./store.js";

export interface IngestDeps {
  resolveEmbedder(tenantId: string): Promise<SearchEmbedder>;
  source: RetrievalSourceRegistration;
  store: RetrievalStore;
}

export async function ingestDocument(
  deps: IngestDeps,
  document: RetrievalDocument
): Promise<void> {
  const { source, store } = deps;
  const tenantId = document.tenant_id?.trim();
  const docId = document.doc_id?.trim();
  if (!(tenantId && docId)) {
    return;
  }
  const chunks = await splitDocument(source.splitter, document);
  if (chunks.length === 0) {
    await store.deleteDocument({
      docId,
      sourceType: source.source_type,
      tenantId,
    });
    return;
  }
  const embedder = await deps.resolveEmbedder(tenantId);
  const embeddings = await embedTexts(
    embedder,
    chunks.map((chunk) => chunk.text)
  );
  await store.upsertDocument({
    chunks,
    document,
    embeddingModel: embedder.modelId,
    embeddings,
    module: source.module_id,
    sourceType: source.source_type,
  });
}

export async function ingestById(
  deps: IngestDeps,
  input: { doc_id: string; tenant_id: string }
): Promise<void> {
  const document = await deps.source.buildDocument(input);
  if (!(document && document.text?.trim())) {
    await deps.store.deleteDocument({
      docId: input.doc_id,
      sourceType: deps.source.source_type,
      tenantId: input.tenant_id,
    });
    return;
  }
  await ingestDocument(deps, document);
}
