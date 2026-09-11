/**
 * Llama Cloud SDK 1.8+ returns {@link ParsingGetResponse}: content is NOT on
 * legacy top-level `markdown_content` — it lives in `markdown_full`,
 * `markdown.pages[]`, `text_full`, `text.pages[]`, structured `items`, or S3
 * payloads referenced by `result_content_metadata.presigned_url`. Without the
 * right `expand` on the GET, those fields are omitted and conversion appears
 * "empty".
 */

import { joinPagesWithBreaks, type PageSlice } from "./page-break.js";

function collectMdFromStructuredItem(item: unknown): string[] {
  if (!item || typeof item !== "object") {
    return [];
  }
  const o = item as Record<string, unknown>;
  if (o.type === "list" && Array.isArray(o.items)) {
    const head = typeof o.md === "string" && o.md.trim() ? [o.md.trim()] : [];
    return [...head, ...o.items.flatMap(collectMdFromStructuredItem)];
  }
  if (typeof o.md === "string" && o.md.trim()) {
    return [o.md.trim()];
  }
  return [];
}

function pageNumberFrom(page: Record<string, unknown>, index: number): number {
  if (typeof page.page_number === "number" && page.page_number > 0) {
    return page.page_number;
  }
  if (typeof page.index === "number" && page.index >= 0) {
    return page.index + 1;
  }
  return index + 1;
}

function slicesFromPages(
  pages: unknown[],
  field: "markdown" | "text"
): PageSlice[] {
  const slices: PageSlice[] = [];
  for (let index = 0; index < pages.length; index++) {
    const raw = pages[index];
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const page = raw as Record<string, unknown>;
    const body = page[field];
    if (typeof body !== "string" || !body.trim()) {
      continue;
    }
    slices.push({
      number: pageNumberFrom(page, index),
      markdown: body.trim(),
    });
  }
  return slices;
}

function markdownFromItemsRoot(itemsRoot: unknown): string {
  if (!itemsRoot || typeof itemsRoot !== "object") {
    return "";
  }
  const pages = (itemsRoot as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) {
    return "";
  }
  const slices: PageSlice[] = [];
  for (let index = 0; index < pages.length; index++) {
    const raw = pages[index];
    if (!raw || typeof raw !== "object" || raw === null) {
      continue;
    }
    const page = raw as Record<string, unknown>;
    if (page.success === false) {
      continue;
    }
    if (!Array.isArray(page.items)) {
      continue;
    }
    const parts: string[] = [];
    for (const item of page.items) {
      parts.push(...collectMdFromStructuredItem(item));
    }
    slices.push({
      number: pageNumberFrom(page, index),
      markdown: parts.join("\n\n").trim(),
    });
  }
  return joinPagesWithBreaks(slices, slices.length);
}

function markdownFromPageList(
  pages: unknown[] | undefined,
  field: "markdown" | "text"
): string {
  if (!Array.isArray(pages)) {
    return "";
  }
  return joinPagesWithBreaks(slicesFromPages(pages, field), pages.length);
}

/**
 * Normalize a `parsing.get` / `waitForCompletion` JSON body into one markdown string.
 * Prefer per-page arrays so we can inject `<page-break>` sentinels.
 */
export function markdownFromLlamaCloudParsingResult(result: unknown): string {
  if (result == null || typeof result !== "object") {
    return "";
  }
  const r = result as Record<string, unknown>;

  const mdObj = r.markdown;
  if (mdObj && typeof mdObj === "object" && mdObj !== null) {
    const fromPages = markdownFromPageList(
      (mdObj as { pages?: unknown[] }).pages,
      "markdown"
    );
    if (fromPages) {
      return fromPages;
    }
  }

  const full = r.markdown_full;
  if (typeof full === "string" && full.trim()) {
    return full.trim();
  }

  const textObj = r.text;
  if (textObj && typeof textObj === "object" && textObj !== null) {
    const fromPages = markdownFromPageList(
      (textObj as { pages?: unknown[] }).pages,
      "text"
    );
    if (fromPages) {
      return fromPages;
    }
  }

  const textFull = r.text_full;
  if (typeof textFull === "string" && textFull.trim()) {
    return textFull.trim();
  }

  const fromItems = markdownFromItemsRoot(r.items);
  if (fromItems) {
    return fromItems;
  }

  const legacyMd = r.markdown_content ?? r.text_content;
  if (typeof legacyMd === "string" && legacyMd.trim()) {
    return legacyMd.trim();
  }

  return "";
}

/**
 * When the API stores large results in S3, `result_content_metadata` holds
 * presigned URLs. Fetch in preference order: markdown-like keys, then text,
 * then any remaining.
 */
export async function fetchMarkdownFromResultContentMetadata(
  result: unknown
): Promise<string> {
  if (result == null || typeof result !== "object") {
    return "";
  }
  const meta = (result as Record<string, unknown>).result_content_metadata;
  if (!meta || typeof meta !== "object" || meta === null) {
    return "";
  }
  const entries = Object.entries(meta as Record<string, unknown>);
  const rank = (key: string): number => {
    const k = key.toLowerCase();
    if (k.includes("markdown")) {
      return 0;
    }
    if (k.includes("text")) {
      return 1;
    }
    return 2;
  };
  entries.sort((a, b) => rank(a[0]) - rank(b[0]));
  for (const [, v] of entries) {
    if (!v || typeof v !== "object") {
      continue;
    }
    const url = (v as { presigned_url?: string | null }).presigned_url;
    if (typeof url !== "string" || !url.trim()) {
      continue;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) {
        continue;
      }
      const body = await res.text();
      if (body.trim()) {
        return body.trim();
      }
    } catch {}
  }
  return "";
}

/**
 * Query params for `waitForCompletion` / `get` so markdown/text/items and S3
 * metadata (presigned URLs) are available when the API uses them.
 */
export const LLAMA_PARSE_EXPAND_FIELDS = [
  "markdown",
  "text",
  "items",
  "markdown_content_metadata",
  "text_content_metadata",
] as const;
