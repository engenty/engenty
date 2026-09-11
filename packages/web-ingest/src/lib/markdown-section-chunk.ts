/**
 * Split oversized markdown into ordered chunks for multi-section storage.
 * Boundaries are chosen at headings first, then blank lines, then a hard cut,
 * so no content is ever dropped — only divided.
 */

/**
 * Per-section size target. Matches the ~24k-char source budget the KB's
 * LLM consumers (template fill, property extract, summarize) read per call,
 * so one stored section fits one model pass.
 */
export const MARKDOWN_SECTION_TARGET_CHARS = 24_000;

const HEADING_RE = /^#{1,6}\s/;
const FENCE_RE = /^\s*(```|~~~)/;

/**
 * Line indices (into `lines`) where a new block may start: every ATX heading
 * outside a code fence. Index 0 is always an implicit start.
 */
function headingBoundaries(lines: string[]): number[] {
  const boundaries: number[] = [];
  let inFence = false;
  for (const [index, line] of lines.entries()) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && index > 0 && HEADING_RE.test(line)) {
      boundaries.push(index);
    }
  }
  return boundaries;
}

/** Split one oversized block on blank lines (paragraph boundaries), then hard-cut. */
function splitBlockByParagraphs(block: string, targetChars: number): string[] {
  const paragraphs = block.split(/\n{2,}/);
  const out: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= targetChars || !current) {
      current = candidate;
      continue;
    }
    out.push(current);
    current = paragraph;
  }
  if (current) {
    out.push(current);
  }
  // A single paragraph can still exceed the target (e.g. one huge <p>): hard-cut.
  return out.flatMap((chunk) => {
    if (chunk.length <= targetChars) {
      return [chunk];
    }
    const pieces: string[] = [];
    for (let i = 0; i < chunk.length; i += targetChars) {
      pieces.push(chunk.slice(i, i + targetChars));
    }
    return pieces;
  });
}

/**
 * Chunk markdown into ordered pieces of at most ~`targetChars` each.
 * Returns `[markdown]` unchanged when it already fits. Chunk edges are
 * trimmed of surrounding blank lines; no non-whitespace content is lost.
 */
export function chunkMarkdownIntoSections(
  markdown: string,
  targetChars: number = MARKDOWN_SECTION_TARGET_CHARS
): string[] {
  if (markdown.length <= targetChars) {
    return [markdown];
  }

  const lines = markdown.split("\n");
  const boundaries = [0, ...headingBoundaries(lines), lines.length];
  const blocks: string[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const block = lines.slice(boundaries[i], boundaries[i + 1]).join("\n");
    if (block.trim()) {
      blocks.push(block);
    }
  }

  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (block.length > targetChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitBlockByParagraphs(block, targetChars));
      continue;
    }
    const candidate = current ? `${current}\n${block}` : block;
    if (candidate.length <= targetChars || !current) {
      current = candidate;
      continue;
    }
    chunks.push(current);
    current = block;
  }
  if (current) {
    chunks.push(current);
  }

  const trimmed = chunks
    .map((chunk) => chunk.replace(/^\n+|\n+$/g, ""))
    .filter((chunk) => chunk.trim());
  return trimmed.length > 0 ? trimmed : [markdown];
}
