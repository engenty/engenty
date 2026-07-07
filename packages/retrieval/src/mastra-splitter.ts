// Mastra MDocument splitter behind the custom-splitter escape hatch.
// Subpath export ("@engenty/retrieval/mastra-splitter") so the root package
// stays free of @mastra/rag for sources that don't chunk (contacts, inbox).
//
// Options are resolved per document so per-tenant settings (KB chunk_strategy /
// chunk_max_length / chunk_overlap) apply without rebuilding the registration.

import { createSearchChunkId, type SearchChunk } from "@engenty/search-index";
import { MDocument } from "@mastra/rag";
import type { RetrievalDocument, SplitterConfigCustom } from "./contracts.js";

export interface MastraSplitterOptions {
  maxSize: number;
  overlap: number;
  strategy: string;
}

export function mastraSplitter(
  resolveOptions: (
    document: RetrievalDocument
  ) => MastraSplitterOptions | Promise<MastraSplitterOptions>
): SplitterConfigCustom {
  return {
    mode: "custom",
    split: async (document) => {
      const options = await resolveOptions(document);
      const doc = MDocument.fromMarkdown(document.text);
      const mastraChunks = await doc.chunk({
        // Mastra types the strategy union internally; settings deliver a
        // validated enum string (see kb_settings schema).
        strategy: options.strategy as never,
        maxSize: options.maxSize,
        overlap: options.overlap,
      });
      return mastraChunks.map(
        (chunk, index): SearchChunk => ({
          chunk_id: createSearchChunkId(document.doc_id, index),
          chunk_index: index,
          doc_id: document.doc_id,
          text: chunk.text,
        })
      );
    },
  };
}
