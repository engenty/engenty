/**
 * `web_fetch` — read one public page as markdown.
 *
 * The fallback for a run whose model cannot fetch by itself (Anthropic models
 * get their provider's own fetch under this name — resolveModelWebTools). The
 * fetch runs on the platform, not on the Space computer, so it is neither a
 * shell command nor bound by the computer's egress allowlist; web-ingest
 * bounds it instead: GET only, public hosts only (every redirect hop checked),
 * 2 MB and 15 s at most.
 */
import { fetchUrlToMarkdown } from "@engenty/web-ingest";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const WEB_FETCH_TOOL_ID = "web_fetch" as const;

const DEFAULT_MAX_CHARS = 20_000;
const MAX_CHARS = 100_000;

const inputSchema = z.object({
  max_chars: z
    .number()
    .int()
    .min(1000)
    .max(MAX_CHARS)
    .optional()
    .describe(`How much of the page to return (default ${DEFAULT_MAX_CHARS}).`),
  url: z.string().url().describe("The public http(s) URL to read."),
});

const outputSchema = z.union([
  z.object({
    content_type: z.string(),
    final_url: z.string(),
    markdown: z.string(),
    ok: z.literal(true),
    title: z.string().optional(),
    truncated: z.boolean(),
  }),
  z.object({ error: z.string(), ok: z.literal(false) }),
]);

export async function runWebFetch(
  input: z.infer<typeof inputSchema>
): Promise<z.infer<typeof outputSchema>> {
  const maxChars = input.max_chars ?? DEFAULT_MAX_CHARS;
  try {
    const page = await fetchUrlToMarkdown(input.url);
    return {
      content_type: page.content_type,
      final_url: page.final_url,
      markdown: page.markdown.slice(0, maxChars),
      ok: true,
      ...(page.suggested_title ? { title: page.suggested_title } : {}),
      truncated: page.markdown.length > maxChars,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

export function createWebFetchTool() {
  return createTool({
    description:
      "Read one public web page (or feed) as markdown. Use it to open a URL you already have — a search result, a source the person named, an RSS feed. For finding pages, use web_search.",
    execute: (input) => runWebFetch(input),
    id: WEB_FETCH_TOOL_ID,
    inputSchema,
    outputSchema,
  });
}
