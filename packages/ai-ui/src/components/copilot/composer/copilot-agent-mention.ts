/** @-mention token after leading whitespace (query is substring after `@` up to cursor). */
export function getMentionQueryAtCursor(
  text: string,
  cursor: number
): { atIndex: number; query: string } | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const slice = text.slice(0, safeCursor);
  const at = slice.lastIndexOf("@");
  if (at < 0) {
    return null;
  }
  if (at > 0) {
    const before = slice[at - 1];
    if (before && !/\s/.test(before)) {
      return null;
    }
  }
  const afterAt = slice.slice(at + 1);
  if (afterAt.includes("\n") || /\s/.test(afterAt)) {
    return null;
  }
  return { atIndex: at, query: afterAt };
}

/**
 * If the trimmed message starts with `@handle` matching a candidate (longest handle wins),
 * returns the remainder as `text` and the agent id.
 */
export function stripLeadingMentionToken(
  raw: string,
  candidates: readonly { handle: string; id: string }[]
): { requestedAgentId?: string; text: string } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("@") || candidates.length === 0) {
    return { text: raw.trim() };
  }
  const afterAt = trimmed.slice(1);
  const sorted = [...candidates].sort(
    (a, b) => b.handle.length - a.handle.length
  );
  for (const c of sorted) {
    const h = c.handle;
    if (!h) {
      continue;
    }
    if (afterAt.length < h.length) {
      continue;
    }
    if (afterAt.slice(0, h.length).toLowerCase() !== h.toLowerCase()) {
      continue;
    }
    const next = afterAt[h.length];
    if (next !== undefined && next !== " " && next !== "\n" && next !== "\t") {
      continue;
    }
    return {
      requestedAgentId: c.id,
      text: afterAt.slice(h.length).trimStart(),
    };
  }
  return { text: raw.trim() };
}
