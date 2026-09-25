/**
 * Human-readable page titles for URL ingest: HTML/meta heuristics, optional cheap LLM,
 * then URL path segment — without requiring the full HTML-extract LLM pass.
 */
import { createLogger } from "@engenty/telemetry";
import { generateText, Output } from "ai";
import { z } from "zod";

import {
  extractHtmlDocumentTitle,
  extractHtmlMetaContent,
} from "./html-prepare.js";

const logger = createLogger({ name: "web-ingest:resolve-page-title" });

const MAX_TITLE_LEN = 120;
const LLM_MARKDOWN_BUDGET = 1500;

const SITE_SUFFIX_RE = /\s*(?:[-–—|·•:]\s*|\s+on\s+)[^|·•:–—-]{1,80}$/i;

const pageTitleLlmSchema = z.object({
  title: z
    .string()
    .describe(
      "Short human-readable page title (max ~120 chars). Not a URL. Omit filler."
    ),
});

export interface ResolveSuggestedPageTitleOptions {
  html?: string;
  /** AI Gateway model id for the optional title LLM; omit to skip it. */
  llmModel?: string;
  markdown: string;
  pageUrl: string;
  /** When true, never call the title LLM (heuristics + path only). */
  skipTitleLlm?: boolean;
}

/** True when the string looks like a URL rather than a display title. */
export function isTitleUrlLike(title: string, pageUrl?: string): boolean {
  const t = title.trim();
  if (!t) {
    return true;
  }
  if (/^https?:\/\//i.test(t)) {
    return true;
  }
  if (/^www\./i.test(t) && /\.\w{2,}/.test(t)) {
    return true;
  }
  try {
    if (pageUrl) {
      const page = new URL(pageUrl);
      const asUrl = t.includes("://") ? new URL(t) : null;
      if (asUrl && asUrl.href === page.href) {
        return true;
      }
      const hostPath = `${page.hostname}${page.pathname}`.toLowerCase();
      const normalized = t
        .replace(/^https?:\/\//i, "")
        .replace(/\/$/, "")
        .toLowerCase();
      if (
        normalized === hostPath ||
        normalized === page.hostname.toLowerCase() ||
        t === pageUrl ||
        t === page.href
      ) {
        return true;
      }
    }
  } catch {
    // ignore invalid URLs
  }
  const slashCount = (t.match(/\//g) ?? []).length;
  if (slashCount >= 2 && /\.\w{2,}(\/|$)/.test(t)) {
    return true;
  }
  if (slashCount >= 1 && /^[\w.-]+\.[a-z]{2,}\//i.test(t) && !/\s/.test(t)) {
    return true;
  }
  return false;
}

/** Strip trailing site-name suffixes from document titles. */
export function cleanPageTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  if (!t) {
    return t;
  }
  for (let i = 0; i < 3; i++) {
    const next = t.replace(SITE_SUFFIX_RE, "").trim();
    if (next === t || !next) {
      break;
    }
    t = next;
  }
  return t.slice(0, MAX_TITLE_LEN);
}

/** First ATX H1 in markdown (`# Title`), skipping code fences. */
export function extractFirstMarkdownH1(markdown: string): string | undefined {
  const lines = markdown.split("\n");
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const m = /^#\s+(.+?)\s*$/.exec(trimmed);
    if (m?.[1]) {
      const h1 = m[1].replace(/\s+#+\s*$/, "").trim();
      if (h1 && !/^https?:\/\//i.test(h1)) {
        return h1;
      }
    }
  }
  return;
}

/** Last non-empty URL path segment as a readable fallback. */
export function titleFromUrlPath(pageUrl: string): string | undefined {
  try {
    const u = new URL(pageUrl);
    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments.at(-1);
    if (!last || last === "index.html" || last === "index.htm") {
      const prev = segments.at(-2);
      if (!prev) {
        return;
      }
      return humanizePathSegment(prev);
    }
    const base = last.replace(/\.[a-z0-9]{1,8}$/i, "");
    return humanizePathSegment(base);
  } catch {
    return;
  }
}

function humanizePathSegment(segment: string): string | undefined {
  const decoded = decodeURIComponent(segment).trim();
  if (!decoded) {
    return;
  }
  const words = decoded
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!words || isTitleUrlLike(words)) {
    return;
  }
  return words.slice(0, MAX_TITLE_LEN);
}

function normalizeCandidate(
  raw: string | undefined,
  pageUrl?: string
): string | undefined {
  if (!raw?.trim()) {
    return;
  }
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (isTitleUrlLike(trimmed, pageUrl)) {
    return;
  }
  const cleaned = cleanPageTitle(trimmed);
  return cleaned || undefined;
}

/** Heuristic title from HTML head + first markdown H1 (no LLM). */
export function resolvePageTitleHeuristic(options: {
  html?: string;
  markdown?: string;
  pageUrl: string;
}): string | undefined {
  const candidates: string[] = [];
  const html = options.html;
  if (html) {
    const docTitle = extractHtmlDocumentTitle(html);
    if (docTitle) {
      candidates.push(docTitle);
    }
    const og = extractHtmlMetaContent(html, "property", "og:title");
    if (og) {
      candidates.push(og);
    }
    const twitter = extractHtmlMetaContent(html, "name", "twitter:title");
    if (twitter) {
      candidates.push(twitter);
    }
  }
  const h1 = options.markdown
    ? extractFirstMarkdownH1(options.markdown)
    : undefined;
  if (h1) {
    candidates.push(h1);
  }

  for (const raw of candidates) {
    const cleaned = normalizeCandidate(raw, options.pageUrl);
    if (cleaned) {
      return cleaned;
    }
  }
  return;
}

function pickBestTitle(
  pageUrl: string,
  ...candidates: (string | undefined)[]
): string | undefined {
  for (const raw of candidates) {
    const cleaned = normalizeCandidate(raw, pageUrl);
    if (cleaned) {
      return cleaned;
    }
  }
  return;
}

async function suggestPageTitleWithLlm(options: {
  htmlTitle?: string;
  llmModel?: string;
  markdown: string;
  pageUrl: string;
}): Promise<string | undefined> {
  const model = options.llmModel;
  if (!(model && process.env.AI_GATEWAY_API_KEY?.trim())) {
    return;
  }
  const mdSnippet = options.markdown.trim().slice(0, LLM_MARKDOWN_BUDGET);
  const htmlTitleLine = options.htmlTitle?.trim()
    ? `HTML <title>: ${options.htmlTitle.trim()}\n`
    : "";

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: pageTitleLlmSchema }),
      prompt: `Return a short human-readable page title for a knowledge base article.

Page URL: ${options.pageUrl}
${htmlTitleLine}
Markdown excerpt:
---
${mdSnippet}
---

Rules:
- Max ${MAX_TITLE_LEN} characters.
- Not a URL; use natural language.
- Prefer the main topic from headings/body over site chrome or cookie banners.`,
    });
    return normalizeCandidate(output.title, options.pageUrl);
  } catch (e) {
    logger.warn("Page title LLM failed", {
      model,
      pageUrl: options.pageUrl,
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }
}

/**
 * Resolve a display title for an ingested URL: heuristics, optional cheap LLM, path segment.
 */
export async function resolveSuggestedPageTitle(
  options: ResolveSuggestedPageTitleOptions
): Promise<string | undefined> {
  const heuristic = resolvePageTitleHeuristic({
    html: options.html,
    markdown: options.markdown,
    pageUrl: options.pageUrl,
  });
  if (heuristic) {
    return heuristic;
  }

  const htmlTitle = options.html
    ? extractHtmlDocumentTitle(options.html)
    : undefined;

  if (!options.skipTitleLlm) {
    const llmTitle = await suggestPageTitleWithLlm({
      htmlTitle,
      llmModel: options.llmModel,
      markdown: options.markdown,
      pageUrl: options.pageUrl,
    });
    if (llmTitle && !isTitleUrlLike(llmTitle, options.pageUrl)) {
      return llmTitle;
    }
  }

  const pathTitle = titleFromUrlPath(options.pageUrl);
  if (pathTitle && !isTitleUrlLike(pathTitle, options.pageUrl)) {
    return pathTitle;
  }

  const lastResort = normalizeCandidate(htmlTitle, options.pageUrl);
  if (lastResort) {
    return lastResort;
  }

  return pathTitle ?? lastResort;
}

/** Prefer the first non-URL-like title among candidates. */
export function pickBetterPageTitle(
  pageUrl: string,
  ...candidates: (string | undefined)[]
): string | undefined {
  return pickBestTitle(pageUrl, ...candidates);
}
