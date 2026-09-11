/** Empty HTML sentinel between page bodies. Must be explicitly closed (not `/>`). */
export const PAGE_BREAK_TAG = "page-break";

export interface PageBreakAttrs {
  number: number;
  printed?: string;
  total?: number;
}

export interface PageSlice {
  markdown: string;
  number: number;
  printed?: string;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

/** `<page-break number="12" total="240"></page-break>` */
export function formatPageBreak(attrs: PageBreakAttrs): string {
  const parts = [`number="${attrs.number}"`];
  if (typeof attrs.total === "number" && attrs.total > 0) {
    parts.push(`total="${attrs.total}"`);
  }
  const printed = attrs.printed?.trim();
  if (printed) {
    parts.push(`printed="${escapeAttr(printed)}"`);
  }
  return `<${PAGE_BREAK_TAG} ${parts.join(" ")}></${PAGE_BREAK_TAG}>`;
}

export function joinPagesWithBreaks(
  pages: readonly PageSlice[],
  total?: number
): string {
  const resolvedTotal = total && total > 0 ? total : pages.length;
  const parts: string[] = [];
  for (const page of pages) {
    const markdown = page.markdown.trim();
    if (!markdown) {
      continue;
    }
    parts.push(
      formatPageBreak({
        number: page.number,
        total: resolvedTotal,
        printed: page.printed,
      })
    );
    parts.push(markdown);
  }
  return parts.join("\n\n").trim();
}

/** Join per-page parser output, falling back to a concatenated blob. */
export function markdownFromPagedParseResult(input: {
  fallback?: string;
  pages: readonly {
    markdown?: string | null;
    number?: number;
    printed?: string;
    text?: string | null;
  }[];
  total?: number;
}): string {
  const slices: PageSlice[] = input.pages.map((page, index) => ({
    number: page.number ?? index + 1,
    markdown: (page.markdown ?? page.text ?? "").trim(),
    ...(page.printed?.trim() ? { printed: page.printed.trim() } : {}),
  }));
  const joined = joinPagesWithBreaks(
    slices,
    input.total ?? (input.pages.length > 0 ? input.pages.length : undefined)
  );
  return joined || (input.fallback ?? "").trim();
}

const PAGE_BREAK_RE = /<page-break\b([^>]*)><\/page-break>/gi;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  for (const match of raw.matchAll(re)) {
    const name = match[1];
    const value = match[2];
    if (name && value != null) {
      attrs[name] = value;
    }
  }
  return attrs;
}

export interface SplitPage {
  markdown: string;
  number: number;
  printed?: string;
  total?: number;
}

/** Split sidecar markdown on page-break sentinels. Untagged text is one page. */
export function splitMarkdownByPageBreaks(markdown: string): SplitPage[] {
  const source = markdown.trim();
  if (!source) {
    return [];
  }
  const matches = [...source.matchAll(PAGE_BREAK_RE)];
  if (matches.length === 0) {
    return [{ markdown: source, number: 1 }];
  }
  const pages: SplitPage[] = [];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    if (!match || match.index == null) {
      continue;
    }
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    const body = source.slice(start, end).trim();
    if (!body) {
      continue;
    }
    const attrs = parseAttrs(match[1] ?? "");
    const number = Number.parseInt(attrs.number ?? "", 10);
    const total = Number.parseInt(attrs.total ?? "", 10);
    const printed = attrs.printed?.trim();
    pages.push({
      markdown: body,
      number: Number.isFinite(number) && number > 0 ? number : index + 1,
      ...(printed ? { printed } : {}),
      ...(Number.isFinite(total) && total > 0 ? { total } : {}),
    });
  }
  return pages;
}
