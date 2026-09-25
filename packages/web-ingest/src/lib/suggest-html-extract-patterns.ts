import { createLogger } from "@engenty/telemetry";
import { generateText, Output } from "ai";
import { z } from "zod";

const logger = createLogger({ name: "web-ingest:html-extract-llm" });

/** Max HTML characters sent to the model (head + tail for very large pages). */
const LLM_HTML_BUDGET = 100_000;

export const htmlExtractPatternSuggestionSchema = z.object({
  includeSelectors: z
    .array(z.string())
    .describe(
      "CSS selectors that match the main article or primary readable content only. Prefer one or two selectors (e.g. main, article, .prose). Empty if the page has no clear main wrapper."
    ),
  excludeSelectors: z
    .array(z.string())
    .describe(
      "Additional CSS selectors for chrome to remove beyond common defaults: menus, sidebars, footers, cookie banners, related posts, comment sections, ads."
    ),
  suggestedTitle: z
    .string()
    .optional()
    .describe(
      "Human-readable page title from visible content or <title>; omit if unknown."
    ),
});

export type HtmlExtractPatternSuggestion = z.infer<
  typeof htmlExtractPatternSuggestionSchema
>;

export interface SuggestHtmlExtractPatternsFromHtmlOptions {
  html: string;
  /** AI Gateway model id. */
  model: string;
  /** Optional URL for model context. */
  pageUrl?: string;
}

function truncateForLlm(html: string): string {
  if (html.length <= LLM_HTML_BUDGET) {
    return html;
  }
  const head = Math.floor(LLM_HTML_BUDGET * 0.85);
  const tail = LLM_HTML_BUDGET - head;
  return `${html.slice(0, head)}\n<!-- … truncated … -->\n${html.slice(-tail)}`;
}

/**
 * Use an LLM to propose include/exclude CSS selectors (and optional title) from raw HTML.
 * Requires `AI_GATEWAY_API_KEY` and a string model id routed via AI Gateway (Vercel AI SDK).
 *
 * Intended for setup wizards: persist the returned selectors on a source, then pass them
 * into {@link applyHtmlExtractSelectors} / fetch `htmlExtract` without calling the LLM again.
 */
export async function suggestHtmlExtractPatternsFromHtml(
  options: SuggestHtmlExtractPatternsFromHtmlOptions
): Promise<HtmlExtractPatternSuggestion> {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    throw new Error(
      "suggestHtmlExtractPatternsFromHtml requires AI_GATEWAY_API_KEY for AI Gateway"
    );
  }

  const model = options.model;
  const snippet = truncateForLlm(options.html);
  const urlLine = options.pageUrl
    ? `Page URL (context): ${options.pageUrl}\n\n`
    : "";

  logger.info("Suggesting HTML extract patterns via LLM", {
    model,
    htmlChars: options.html.length,
    snippetChars: snippet.length,
  });

  const { output } = await generateText({
    model,
    output: Output.object({ schema: htmlExtractPatternSuggestionSchema }),
    prompt: `${urlLine}You help configure HTML→Markdown extraction for a web crawler.

Analyze this HTML and return:
1) includeSelectors — CSS selectors for the main editorial/content region only (e.g. main, article, .markdown-body). Use valid selectors. Leave empty if unclear. Never choose a wrapper that primarily contains cookie, privacy, consent, advertising, navigation, or footer UI.
2) excludeSelectors — extra selectors for noisy regions: navigation, header bars, footers, sidebars, comment widgets, "related articles", social share blocks, ads, and especially cookie/consent/privacy UI.
3) suggestedTitle — short title if obvious from content or <title>.

Rules:
- Prefer stable, simple selectors (ids/classes visible in the snippet).
- Do not invent ids/classes that are not present in the HTML.
- Treat cookie dialogs and privacy preference managers as unwanted content even when they contain lots of readable text or links.
- Explicitly exclude consent surfaces such as Borlabs Cookie, Cookiebot, OneTrust, Complianz, cookie banners, cookie details, "Datenschutzeinstellungen", "Ich stimme allen Cookies zu", "Notwendige Cookies akzeptieren", "Accept all cookies", and cookie category lists like Necessary/Statistics/Marketing/External media.
- If a cookie dialog is inside the same broad container as the article, keep the article include selector broad enough and add precise excludeSelectors for the dialog subtree.
- Return at most 12 selectors per array.

HTML:
---
${snippet}
---`,
  });

  return {
    includeSelectors: output.includeSelectors.slice(0, 12),
    excludeSelectors: output.excludeSelectors.slice(0, 12),
    suggestedTitle: output.suggestedTitle,
  };
}
