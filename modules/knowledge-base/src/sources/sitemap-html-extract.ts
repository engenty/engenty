import { fetchText } from "@engenty/document-sources";
import { createLogger } from "@engenty/telemetry";
import type { HtmlExtractPatternSuggestion } from "@engenty/web-ingest";
import { suggestHtmlExtractPatternsFromHtml } from "@engenty/web-ingest";

const logger = createLogger({ name: "kb:source:sitemap-html-extract" });

function dedupeSelectors(selectors: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of selectors) {
    const s = raw.trim();
    if (!s || seen.has(s)) {
      continue;
    }
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Merge LLM outputs from several sample pages into one selector set for the whole sitemap run. */
export function mergeHtmlExtractPatternSuggestions(
  suggestions: readonly HtmlExtractPatternSuggestion[]
): { includeSelectors: string[]; excludeSelectors: string[] } {
  const excludeSelectors = dedupeSelectors(
    suggestions.flatMap((s) => s.excludeSelectors ?? [])
  ).slice(0, 24);
  const includeSelectors = dedupeSelectors(
    suggestions.flatMap((s) => s.includeSelectors ?? [])
  ).slice(0, 12);
  return { includeSelectors, excludeSelectors };
}

async function suggestFromSamples(
  sampleUrls: readonly string[]
): Promise<Record<string, unknown>> {
  const suggestions: HtmlExtractPatternSuggestion[] = [];
  for (const url of sampleUrls) {
    const html = await fetchText(url);
    const s = await suggestHtmlExtractPatternsFromHtml({ html, pageUrl: url });
    suggestions.push(s);
  }
  const merged = mergeHtmlExtractPatternSuggestions(suggestions);
  if (!(merged.includeSelectors.length || merged.excludeSelectors.length)) {
    return { html_extract_use_defaults_only: true };
  }
  return {
    html_exclude_selectors: merged.excludeSelectors,
    html_include_selectors: merged.includeSelectors,
  };
}

/**
 * Per-run settings overlay for sitemap sources (not persisted):
 * - **≤3 URLs:** default HTTP fetch cleanup (no per-URL LLM).
 * - **>3 URLs:** LLM on three sample URLs, merged include/exclude used for every item; if that
 *   yields nothing or errors, fall back to smart default HTML cleanup (no LLM).
 */
export async function mergeSitemapHtmlExtractIntoSettings(
  baseSettings: Record<string, unknown>,
  entryCount: number,
  sampleUrls: readonly string[]
): Promise<Record<string, unknown>> {
  const {
    html_extract_suggest_patterns_with_llm: _dropLlm,
    html_extract_use_defaults_only: _dropDef,
    html_exclude_selectors: _dropExc,
    html_include_selectors: _dropInc,
    ...rest
  } = baseSettings;
  const next: Record<string, unknown> = { ...rest };

  if (entryCount <= 3) {
    return next;
  }
  try {
    const injected = await suggestFromSamples(sampleUrls);
    Object.assign(next, injected);
    return next;
  } catch (error) {
    logger.warn(
      "Sitemap HTML extract suggestion failed; falling back to default HTML cleanup",
      {
        error: error instanceof Error ? error.message : String(error),
      }
    );
    next.html_extract_use_defaults_only = true;
    return next;
  }
}
