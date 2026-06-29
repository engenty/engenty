/**
 * Prepare server-fetched HTML for markdown conversion: remove embedded payloads
 * (scripts, Next.js Flight, etc.) and detect client-only shells.
 */
import { htmlToMarkdown } from "./html-to-markdown.js";

const CLIENT_SHELL_MARKERS = [
  "BAILOUT_TO_CLIENT_SIDE_RENDERING",
  "__next_f",
  "self.__next_f",
];

const FETCH_SHELL_HINT =
  "_Plain HTTP fetch only sees the initial HTML shell for this site. For full documentation text, set **FIRECRAWL_API_KEY** for the **API** process (repo-root `.env.local` is loaded on startup; restart after changes), see [Firecrawl scrape](https://docs.firecrawl.dev/features/scrape), or paste the content manually._";

const LIMITED_BODY_HINT =
  "_Little readable text was found in the HTML body. For JavaScript-heavy pages, set **FIRECRAWL_API_KEY** or paste the content._";

/** Remove tags whose text must not become article markdown. */
export function stripHtmlForMarkdown(html: string): string {
  let out = html;
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");
  out = out.replace(/<template\b[\s\S]*?<\/template>/gi, "");
  return out;
}

export function isLikelyClientRenderedShell(html: string): boolean {
  return CLIENT_SHELL_MARKERS.some((m) => html.includes(m));
}

/** Document `<title>` text (decoded entities not applied). */
export function extractHtmlDocumentTitle(html: string): string | undefined {
  return /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
}

/** Meta tag `content` for a given `name` or `property` attribute value. */
export function extractHtmlMetaContent(
  html: string,
  attr: "name" | "property",
  value: string
): string | undefined {
  const limit = Math.min(html.length, 800_000);
  const slice = html.slice(0, limit);
  const nameRe = new RegExp(
    `${attr}\\s*=\\s*["']${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    "i"
  );
  for (const m of slice.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!nameRe.test(tag)) {
      continue;
    }
    const c = /content\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (c?.[1]?.trim()) {
      return c[1].trim();
    }
  }
  return;
}

/** Title + meta description (and og:description fallback) for head-only summaries. */
export function extractHeadSummaryMarkdown(html: string): string | null {
  const title = extractHtmlDocumentTitle(html);
  const description =
    extractHtmlMetaContent(html, "name", "description") ??
    extractHtmlMetaContent(html, "property", "og:description");
  const lines: string[] = [];
  if (title) {
    lines.push(`# ${title}`);
  }
  if (description) {
    lines.push(description);
  }
  if (lines.length === 0) {
    return null;
  }
  return lines.join("\n\n");
}

const MIN_BODY_CHARS = 160;

/**
 * Turn raw HTML into markdown: strip embeds, then Turndown on the cleaned document.
 * Client-rendered shells (e.g. Next.js + RSC) get title/description + a Firecrawl hint
 * instead of dumping Flight / inline script text into markdown.
 */
export function htmlToMarkdownFromFetchedPage(html: string): string {
  const shell = isLikelyClientRenderedShell(html);
  const cleaned = stripHtmlForMarkdown(html);
  const bodyMd = htmlToMarkdown(cleaned).trim();

  if (shell) {
    const head = extractHeadSummaryMarkdown(html);
    if (head) {
      return `${head}\n\n---\n\n${FETCH_SHELL_HINT}`;
    }
    throw new Error(
      "This URL loads in the browser; the fetched HTML has no usable article text. Set FIRECRAWL_API_KEY for server-side scrape, or paste the content."
    );
  }

  if (bodyMd.length >= MIN_BODY_CHARS) {
    return bodyMd;
  }

  const head = extractHeadSummaryMarkdown(html);
  if (head) {
    const hint = bodyMd.length > 0 ? `${bodyMd}\n\n---\n\n` : "";
    return `${hint}${head}\n\n---\n\n${LIMITED_BODY_HINT}`;
  }

  if (bodyMd.length > 0) {
    return bodyMd;
  }

  throw new Error(
    "No extractable text from HTML after removing scripts and styles."
  );
}
