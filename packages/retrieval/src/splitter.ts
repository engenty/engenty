// SplitterConfig → SearchChunk[]. `none` wraps the whole document as chunk 0;
// `fixed`/`paragraph` delegate to the shared chunker in @engenty/search-index;
// `custom` is the escape hatch (Mastra strategies come in through it — see
// ./mastra-splitter.ts, kept out of the root export so non-chunking consumers
// don't pull @mastra/rag).

import {
  createSearchChunkId,
  createSearchChunks,
  type SearchChunk,
} from "@engenty/search-index";
import type { RetrievalDocument, SplitterConfig } from "./contracts.js";

const DEFAULT_MAX_CHUNK_LENGTH = 1000;
const DEFAULT_OVERLAP = 100;

export async function splitDocument(
  config: SplitterConfig,
  document: RetrievalDocument
): Promise<SearchChunk[]> {
  const text = document.text?.trim() ?? "";
  if (!text) {
    return [];
  }
  if (config.mode === "none") {
    return [
      {
        chunk_id: createSearchChunkId(document.doc_id, 0),
        chunk_index: 0,
        doc_id: document.doc_id,
        text,
      },
    ];
  }
  if (config.mode === "custom") {
    return config.split(document);
  }
  return createSearchChunks({
    doc_id: document.doc_id,
    max_chunk_length: config.max_chunk_length ?? DEFAULT_MAX_CHUNK_LENGTH,
    mode: config.mode,
    overlap: config.overlap ?? DEFAULT_OVERLAP,
    text,
  });
}
