const INITIAL_SESSION_TITLE_MAX_LENGTH = 72;

function stripLeadingMarkdownPrefix(value: string): string {
  return value
    .replace(/^\s{0,3}>+\s*/g, "")
    .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/g, "")
    .trim();
}

export function deriveInitialThreadTitleFromText(
  text: string | null | undefined
): string | null {
  const normalized = stripLeadingMarkdownPrefix(
    (text ?? "").replace(/\s+/g, " ").trim()
  );
  if (normalized.length < 2) {
    return null;
  }
  if (normalized.length <= INITIAL_SESSION_TITLE_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, INITIAL_SESSION_TITLE_MAX_LENGTH - 3).trimEnd()}...`;
}
