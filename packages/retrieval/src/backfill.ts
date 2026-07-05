// Batched backfill: scan wide (status window), work narrow (limit), embed all
// pending chunks in one embedTexts pass (the embedder batches internally).
// Per-document build/split failures are recorded without aborting the run; an
// embedding-batch failure fails every document in that batch honestly.

import { embedTexts } from "@engenty/search-index";
import type {
  RetrievalBackfillInput,
  RetrievalBackfillResult,
} from "./contracts.js";
import type { IngestDeps } from "./ingest.js";
import { splitDocument } from "./splitter.js";
import { scanIndexState } from "./status.js";

const DEFAULT_BACKFILL_LIMIT = 100;
const MAX_BACKFILL = 500;

export async function runBackfill(
  deps: IngestDeps,
  input: RetrievalBackfillInput
): Promise<RetrievalBackfillResult> {
  const tenantId = input.tenant_id?.trim();
  if (!tenantId) {
    return { failed: 0, processed: 0, results: [] };
  }
  const limit = Math.min(
    Math.max(input.limit ?? DEFAULT_BACKFILL_LIMIT, 1),
    MAX_BACKFILL
  );
  const { pending } = await scanIndexState(deps.source, deps.store, tenantId, {
    force: input.force,
  });
  const targetIds = pending.slice(0, limit);
  if (targetIds.length === 0) {
    return { failed: 0, processed: 0, results: [] };
  }

  const results: RetrievalBackfillResult["results"] = [];
  const prepared: {
    chunks: Awaited<ReturnType<typeof splitDocument>>;
    document: NonNullable<
      Awaited<ReturnType<typeof deps.source.buildDocument>>
    >;
  }[] = [];

  for (const docId of targetIds) {
    try {
      const document = await deps.source.buildDocument({
        doc_id: docId,
        tenant_id: tenantId,
      });
      if (!document || !document.text?.trim()) {
        await deps.store.deleteDocument({
          docId,
          sourceType: deps.source.source_type,
          tenantId,
        });
        results.push({ doc_id: docId, ok: true });
        continue;
      }
      const chunks = await splitDocument(deps.source.splitter, document);
      if (chunks.length === 0) {
        await deps.store.deleteDocument({
          docId,
          sourceType: deps.source.source_type,
          tenantId,
        });
        results.push({ doc_id: docId, ok: true });
        continue;
      }
      prepared.push({ chunks, document });
    } catch (err) {
      results.push({
        doc_id: docId,
        error: err instanceof Error ? err.message : String(err),
        ok: false,
      });
    }
  }

  if (prepared.length > 0) {
    try {
      const embedder = await deps.resolveEmbedder(tenantId);
      const texts = prepared.flatMap((entry) =>
        entry.chunks.map((chunk) => chunk.text)
      );
      const vectors = await embedTexts(embedder, texts);
      let cursor = 0;
      for (const entry of prepared) {
        const slice = vectors.slice(cursor, cursor + entry.chunks.length);
        cursor += entry.chunks.length;
        try {
          await deps.store.upsertDocument({
            chunks: entry.chunks,
            document: entry.document,
            embeddingModel: embedder.modelId,
            embeddings: slice,
            module: deps.source.module_id,
            sourceType: deps.source.source_type,
          });
          results.push({ doc_id: entry.document.doc_id, ok: true });
        } catch (err) {
          results.push({
            doc_id: entry.document.doc_id,
            error: err instanceof Error ? err.message : String(err),
            ok: false,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const entry of prepared) {
        results.push({
          doc_id: entry.document.doc_id,
          error: message,
          ok: false,
        });
      }
    }
  }

  return {
    failed: results.filter((r) => !r.ok).length,
    processed: results.length,
    results,
  };
}
