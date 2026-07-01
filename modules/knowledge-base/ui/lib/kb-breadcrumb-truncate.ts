const ELLIPSIS = "\u2026";

/** Default max visible characters per KB shell breadcrumb segment (including ellipsis). */
export const KB_BREADCRUMB_SEGMENT_MAX_CHARS = 40;

/**
 * Shortens a breadcrumb label for the top bar; full text is returned as `tooltip` when truncated.
 */
export function truncateKbBreadcrumbSegment(
  raw: string,
  maxChars: number = KB_BREADCRUMB_SEGMENT_MAX_CHARS
): { label: string; tooltip?: string } {
  const text = raw.trim();
  if (text.length === 0) {
    return { label: raw };
  }
  if (text.length <= maxChars) {
    return { label: text };
  }
  const head = text.slice(0, Math.max(1, maxChars - 1)).trimEnd();
  return {
    label: `${head}${ELLIPSIS}`,
    tooltip: text,
  };
}
