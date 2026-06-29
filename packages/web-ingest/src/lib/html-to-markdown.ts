/**
 * HTML → Markdown via [Turndown](https://github.com/mixmark-io/turndown) +
 * [turndown-plugin-gfm](https://github.com/mixmark-io/turndown-plugin-gfm) for tables,
 * strikethrough, and task lists.
 */
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

let singleton: TurndownService | null = null;

export function createHtmlToMarkdownService(): TurndownService {
  const td = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    headingStyle: "atx",
  });
  td.use(gfm);
  return td;
}

/** Shared converter (thread-safe for turndown’s read-only use after init). */
export function htmlToMarkdown(html: string): string {
  if (!singleton) {
    singleton = createHtmlToMarkdownService();
  }
  return singleton.turndown(html).trim();
}
