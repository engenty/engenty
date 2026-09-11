/**
 * Pure planning helpers for source ingestion.
 *
 * Ingestion has two independent questions — how many articles to create and
 * what goes inside each one. This module answers the second one without
 * touching the database or a model, so the rules stay testable: which body
 * parts a run produces, and how an oversized body is cut into sub-pages.
 */

import type { KbSourceIngestContentOptions } from "../schema/sources.js";

/**
 * Bodies longer than this are candidates for the sub-page split. Chosen to sit
 * just above the ~24k-char budget one LLM pass reads: below it a page is still
 * a single readable unit, above it nothing downstream can see the whole thing
 * at once anyway.
 */
export const SUB_PAGE_SPLIT_THRESHOLD_CHARS = 30_000;

/** A split that produces fewer pages than this is not worth an index page. */
const MIN_SUB_PAGES = 2;

export interface ResolvedIngestContentFlags {
  attachOriginal: boolean;
  includeFullContent: boolean;
  includeQuestions: boolean;
  includeSummary: boolean;
  splitLongArticles: boolean;
}

/**
 * Normalize the content switches for one run.
 *
 * The one invariant: an article must have *something* in it. When the caller
 * asks for neither the full text nor a summary, a template structure is the
 * only remaining body — and with no template either, full content is the
 * fallback, because creating empty drafts is never what anyone meant.
 */
export function resolveIngestContentFlags(
  options: KbSourceIngestContentOptions,
  hasTemplateStructure: boolean
): ResolvedIngestContentFlags {
  const includeSummary = options.include_summary ?? false;
  let includeFullContent = options.include_full_content ?? !includeSummary;
  if (!(includeFullContent || includeSummary || hasTemplateStructure)) {
    includeFullContent = true;
  }
  return {
    attachOriginal: options.attach_original ?? false,
    includeFullContent,
    includeQuestions: options.include_questions ?? false,
    includeSummary,
    // Splitting a summary is meaningless — it is short by construction.
    splitLongArticles:
      (options.split_long_articles ?? false) && includeFullContent,
  };
}

export interface MarkdownSubPage {
  markdown: string;
  title: string;
}

export interface MarkdownSubPageSplit {
  /** Everything above the first heading — becomes the index page's lead-in. */
  intro: string;
  pages: MarkdownSubPage[];
}

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

interface HeadingHit {
  level: number;
  line: number;
  title: string;
}

function scanHeadings(lines: string[]): HeadingHit[] {
  const hits: HeadingHit[] = [];
  let inFence = false;
  for (const [index, line] of lines.entries()) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = HEADING_RE.exec(line);
    if (match) {
      hits.push({
        level: match[1]!.length,
        line: index,
        title: match[2]!.trim(),
      });
    }
  }
  return hits;
}

/**
 * Cut a long document into sub-pages at its own headings.
 *
 * The split level is the *shallowest* heading level that yields at least
 * {@link MIN_SUB_PAGES} sections, so a document whose only h1 is its title
 * still splits at its h2 chapters instead of producing one giant page.
 * Returns null when the text is too short or has no usable structure — the
 * caller then keeps it as a single article rather than inventing a hierarchy.
 */
export function splitMarkdownIntoSubPages(
  markdown: string,
  thresholdChars: number = SUB_PAGE_SPLIT_THRESHOLD_CHARS
): MarkdownSubPageSplit | null {
  if (markdown.length < thresholdChars) {
    return null;
  }
  const lines = markdown.split("\n");
  const headings = scanHeadings(lines);
  if (headings.length === 0) {
    return null;
  }

  const levels = [...new Set(headings.map((h) => h.level))].sort(
    (a, b) => a - b
  );
  const splitLevel = levels.find(
    (level) => headings.filter((h) => h.level === level).length >= MIN_SUB_PAGES
  );
  if (splitLevel === undefined) {
    return null;
  }

  const starts = headings.filter((h) => h.level === splitLevel);
  const intro = lines.slice(0, starts[0]!.line).join("\n").trim();
  const pages: MarkdownSubPage[] = starts.map((start, index) => {
    const end = starts[index + 1]?.line ?? lines.length;
    // Drop the heading line itself: it becomes the sub-page title, and
    // repeating it as the body's first line reads as a duplicate.
    const body = lines
      .slice(start.line + 1, end)
      .join("\n")
      .trim();
    return { markdown: body, title: start.title };
  });

  return { intro, pages: pages.filter((page) => page.markdown.length > 0) };
}

/** A sub-page as it appears in the index: title plus, once created, its id. */
export interface SubPageIndexEntry {
  /** Article id, once the sub-page exists. Null renders as plain text. */
  articleId?: string | null;
  title: string;
}

/**
 * The index page's contents list.
 *
 * Entries link to their sub-page when the id is known. The ids only exist
 * after the children are created, which is why the index is written twice:
 * once to give the children a parent, then again with the links in place. An
 * unlinked contents list is a table of contents you cannot navigate.
 */
export function buildSubPageIndexMarkdown(
  intro: string,
  pages: readonly SubPageIndexEntry[],
  headingLabel: string,
  articleHref?: (articleId: string) => string
): string {
  const list = pages.map((page, index) => {
    const label =
      page.articleId && articleHref
        ? `[${page.title}](${articleHref(page.articleId)})`
        : page.title;
    return `${index + 1}. ${label}`;
  });
  return [intro, `## ${headingLabel}`, list.join("\n")]
    .filter((part) => part.trim())
    .join("\n\n");
}
