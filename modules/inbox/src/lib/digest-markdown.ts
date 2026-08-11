/**
 * Pure helpers for inbox message digests — safe to import from UI and services.
 */

/** JSON-escape artifacts small models leave inside the markdown string. */
export function unescapeDigestEscapes(markdown: string): string {
  if (!/\\[nrt"'\\]/.test(markdown)) {
    return markdown;
  }
  return markdown
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

/**
 * A bullet whose text landed on the next line renders as an empty marker with
 * an orphaned paragraph. Applied to both the model's input and its output —
 * the model tends to mirror whatever structure it was handed.
 */
export function normalizeDigestMarkdown(markdown: string): string {
  return unescapeDigestEscapes(markdown)
    .replace(/^([ \t]*[-*])[ \t]*\n+(?=[ \t]*\S)/gm, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Model gave up / placeholder — not usable as a conversation bubble. */
export function isUselessDigestContent(markdown: string): boolean {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return true;
  }
  return /^(\.{1,3}|…+|[-–—]|n\/a|none|empty|null|kein inhalt)$/i.test(trimmed);
}

/**
 * Prefer the deterministic HTML→Markdown extract when the model collapsed a
 * substantial body into a stub (e.g. only "..." or a few characters).
 */
export function shouldFallbackToExtractedBody(
  content: string,
  extractedBody: string
): boolean {
  if (isUselessDigestContent(content)) {
    return true;
  }
  const bodyLen = extractedBody.trim().length;
  const contentLen = content.trim().length;
  if (bodyLen >= 100 && contentLen < 20) {
    return true;
  }
  if (bodyLen >= 400 && contentLen < bodyLen * 0.02) {
    return true;
  }
  return false;
}
