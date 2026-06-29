import { createLogger } from "@engenty/telemetry";
import { parseHTML } from "linkedom";

import { DEFAULT_HTML_EXCLUDE_SELECTORS } from "./html-extract-defaults.js";

const logger = createLogger({ name: "web-ingest:html-extract" });

/** Options for trimming HTML before Turndown. */
export interface HtmlExtractPatternOptions {
  /** Removed after defaults (unless {@link skipDefaultExcludeSelectors}). */
  excludeSelectors?: string[];
  /** If set, only content inside these selectors is kept (union of top-level matches). */
  includeSelectors?: string[];
  /** When true, {@link DEFAULT_HTML_EXCLUDE_SELECTORS} are not applied. */
  skipDefaultExcludeSelectors?: boolean;
}

function wrapFragmentAsDocument(html: string): string {
  const t = html.trim();
  if (/^<!DOCTYPE/i.test(t) || /<\s*html[\s>]/i.test(t)) {
    return t;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

function queryAllSafe(document: Document, selector: string): Element[] {
  try {
    return [...document.querySelectorAll(selector)];
  } catch {
    logger.warn("Skipping invalid CSS selector", { selector });
    return [];
  }
}

function collectExcludeElements(
  document: Document,
  selectors: readonly string[]
): Element[] {
  const seen = new Set<Element>();
  const out: Element[] = [];
  for (const sel of selectors) {
    for (const el of queryAllSafe(document, sel)) {
      if (!seen.has(el)) {
        seen.add(el);
        out.push(el);
      }
    }
  }
  return out;
}

/** Deepest nodes first so removing a subtree does not leave stale descendant refs in the work list. */
function sortByDepthDescending(elements: Element[]): Element[] {
  return [...elements].sort((a, b) => {
    const depth = (n: Element): number => {
      let d = 0;
      let p: Element | null = n;
      while (p?.parentElement) {
        d += 1;
        p = p.parentElement;
      }
      return d;
    };
    return depth(b) - depth(a);
  });
}

function removeExcludeNodes(
  document: Document,
  selectors: readonly string[]
): void {
  const toRemove = sortByDepthDescending(
    collectExcludeElements(document, selectors)
  );
  for (const el of toRemove) {
    el.remove();
  }
}

/**
 * When include selectors are set, keep only top-level matching subtrees (not nested
 * inside another match).
 */
function applyIncludeOnly(
  document: Document,
  selectors: readonly string[]
): boolean {
  if (selectors.length === 0) {
    return false;
  }
  const matches: Element[] = [];
  for (const sel of selectors) {
    matches.push(...queryAllSafe(document, sel));
  }
  if (matches.length === 0) {
    return false;
  }
  const tops = matches.filter(
    (m) => !matches.some((o) => o !== m && o.contains(m))
  );
  const body = document.querySelector("body");
  if (!body) {
    return false;
  }
  body.innerHTML = tops.map((el) => el.outerHTML).join("\n");
  return true;
}

/**
 * Apply include/exclude CSS selectors to HTML. Excludes run first (with optional
 * defaults), then optional include restriction to main-like regions.
 */
export function applyHtmlExtractSelectors(
  html: string,
  options?: HtmlExtractPatternOptions
): string {
  const wrapped = wrapFragmentAsDocument(html);
  const { document } = parseHTML(wrapped);

  const exclude: string[] = [];
  if (!options?.skipDefaultExcludeSelectors) {
    exclude.push(...DEFAULT_HTML_EXCLUDE_SELECTORS);
  }
  if (options?.excludeSelectors?.length) {
    exclude.push(...options.excludeSelectors);
  }
  removeExcludeNodes(document, exclude);

  const include = options?.includeSelectors?.filter(Boolean) ?? [];
  if (include.length > 0) {
    const applied = applyIncludeOnly(document, include);
    if (!applied) {
      logger.info(
        "No include selector matched; using document after excludes",
        {
          include,
        }
      );
    }
  }

  return document.documentElement?.outerHTML ?? wrapped;
}
