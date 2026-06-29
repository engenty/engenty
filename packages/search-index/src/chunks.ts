// Chunking helpers shared by all providers.
//
// `mode: "fixed"` slices on character boundaries (cheap, predictable).
// `mode: "paragraph"` accumulates `\n\n`-separated paragraphs up to
// `max_chunk_length` with optional word-overlap between consecutive chunks
// (matches KB's historical chunkText so we can drop the bespoke copy).

import type {
  SearchChunk,
  SearchMetadata,
  SearchSourceLines,
} from "./contracts.js";

const CHUNK_ID_SEPARATOR = "::chunk::";

export function createSearchChunkId(docId: string, chunkIndex: number): string {
  if (!docId.trim()) {
    throw new Error("docId is required");
  }
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw new Error("chunkIndex must be a non-negative integer");
  }
  return `${docId}${CHUNK_ID_SEPARATOR}${chunkIndex}`;
}

export function parseSearchChunkId(chunkId: string): {
  chunk_index: number;
  doc_id: string;
} | null {
  const separatorIndex = chunkId.lastIndexOf(CHUNK_ID_SEPARATOR);
  if (separatorIndex <= 0) {
    return null;
  }
  const docId = chunkId.slice(0, separatorIndex);
  const rawIndex = chunkId.slice(separatorIndex + CHUNK_ID_SEPARATOR.length);
  const chunkIndex = Number.parseInt(rawIndex, 10);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return null;
  }
  return {
    chunk_index: chunkIndex,
    doc_id: docId,
  };
}

export function compactSearchText(
  parts: Array<string | null | undefined>,
  separator = "\n\n"
): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(separator)
    .trim();
}

export interface CreateSearchChunksOptions {
  doc_id: string;
  max_chunk_length?: number;
  metadata?: SearchMetadata;
  mode?: "fixed" | "paragraph";
  // Only honored in paragraph mode. Approximate word overlap kept between chunks.
  overlap?: number;
  text: string;
  // When true, populate `source_lines` (1-indexed) on each chunk.
  track_lines?: boolean;
}

export function createSearchChunks(
  params: CreateSearchChunksOptions
): SearchChunk[] {
  const mode = params.mode ?? "fixed";
  if (mode === "paragraph") {
    return createParagraphChunks(params);
  }
  return createFixedChunks(params);
}

function createFixedChunks(params: CreateSearchChunksOptions): SearchChunk[] {
  const maxChunkLength = Math.max(params.max_chunk_length ?? 4000, 1);
  const chunks: SearchChunk[] = [];
  let index = 0;
  for (let start = 0; start < params.text.length; start += maxChunkLength) {
    const end = Math.min(start + maxChunkLength, params.text.length);
    const slice = params.text.slice(start, end);
    const trimmed = slice.trim();
    if (!trimmed) {
      continue;
    }
    const sourceOffset = { end, start };
    chunks.push(buildChunk(params, trimmed, sourceOffset, index));
    index += 1;
  }
  return chunks;
}

function createParagraphChunks(
  params: CreateSearchChunksOptions
): SearchChunk[] {
  const maxChunkLength = Math.max(params.max_chunk_length ?? 1000, 1);
  const overlap = Math.max(params.overlap ?? 0, 0);
  if (!params.text.trim()) {
    return [];
  }
  const paragraphs = splitParagraphsWithOffsets(params.text);
  const chunks: SearchChunk[] = [];
  let buffer = "";
  let bufferStart: number | null = null;
  let bufferEnd = 0;
  let index = 0;

  const flush = () => {
    if (!buffer.trim() || bufferStart === null) {
      return;
    }
    const sourceOffset = { end: bufferEnd, start: bufferStart };
    chunks.push(buildChunk(params, buffer.trim(), sourceOffset, index));
    index += 1;
  };

  for (const para of paragraphs) {
    const tentativeLength =
      buffer.length + para.text.length + (buffer.length > 0 ? 2 : 0);
    if (tentativeLength > maxChunkLength && buffer.length > 0) {
      flush();
      const overlapText = overlap > 0 ? takeWordsFromEnd(buffer, overlap) : "";
      buffer = overlapText ? `${overlapText}\n\n${para.text}` : para.text;
      bufferStart = para.start;
      bufferEnd = para.end;
    } else {
      if (buffer.length === 0) {
        bufferStart = para.start;
      }
      buffer += (buffer ? "\n\n" : "") + para.text;
      bufferEnd = para.end;
    }
  }
  flush();
  return chunks;
}

interface ParagraphSpan {
  end: number;
  start: number;
  text: string;
}

function splitParagraphsWithOffsets(text: string): ParagraphSpan[] {
  const spans: ParagraphSpan[] = [];
  const re = /\n{2,}/g;
  let lastIndex = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    pushSpan(spans, text, lastIndex, m.index);
    lastIndex = m.index + m[0].length;
  }
  pushSpan(spans, text, lastIndex, text.length);
  return spans;
}

function pushSpan(
  spans: ParagraphSpan[],
  text: string,
  rawStart: number,
  rawEnd: number
): void {
  if (rawEnd <= rawStart) {
    return;
  }
  const slice = text.slice(rawStart, rawEnd);
  const leading = slice.match(/^\s*/)?.[0].length ?? 0;
  const trailing = slice.match(/\s*$/)?.[0].length ?? 0;
  const start = rawStart + leading;
  const end = rawEnd - trailing;
  if (end <= start) {
    return;
  }
  spans.push({ end, start, text: text.slice(start, end) });
}

function takeWordsFromEnd(text: string, approxChars: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "";
  }
  const wordCount = Math.max(1, Math.ceil(approxChars / 6));
  return words.slice(-wordCount).join(" ");
}

function buildChunk(
  params: CreateSearchChunksOptions,
  text: string,
  sourceOffset: { end: number; start: number },
  index: number
): SearchChunk {
  const chunk: SearchChunk = {
    chunk_id: createSearchChunkId(params.doc_id, index),
    chunk_index: index,
    doc_id: params.doc_id,
    ...(params.metadata ? { metadata: params.metadata } : {}),
    source_offset: sourceOffset,
    text,
  };
  if (params.track_lines) {
    chunk.source_lines = computeSourceLines(params.text, sourceOffset);
  }
  return chunk;
}

function computeSourceLines(
  text: string,
  offset: { end: number; start: number }
): SearchSourceLines {
  const start = countLines(text, 0, offset.start) + 1;
  const end = countLines(text, 0, Math.max(offset.end - 1, offset.start)) + 1;
  return { end: Math.max(end, start), start };
}

function countLines(text: string, from: number, to: number): number {
  let count = 0;
  for (let i = from; i < to; i += 1) {
    if (text.charCodeAt(i) === 10) {
      count += 1;
    }
  }
  return count;
}
