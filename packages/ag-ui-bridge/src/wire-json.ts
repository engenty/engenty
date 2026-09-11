const MAX_REVIVE_DEPTH = 8;
const MAX_REVIVE_STRING = 200_000;

export type JsonHighlightTokenKind =
  | "key"
  | "keyword"
  | "number"
  | "punct"
  | "string"
  | "text";

export interface JsonHighlightToken {
  kind: JsonHighlightTokenKind;
  value: string;
}

function looksLikeJsonContainer(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > MAX_REVIVE_STRING) {
    return false;
  }
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

/**
 * Unfold JSON that landed as a string token (`"{\"ok\":true}"`) so the wire
 * view can pretty-print nested payloads instead of one escaped line.
 */
export function reviveJsonStrings(value: unknown, depth = 0): unknown {
  if (depth > MAX_REVIVE_DEPTH) {
    return value;
  }
  if (typeof value === "string") {
    if (!looksLikeJsonContainer(value)) {
      return value;
    }
    try {
      return reviveJsonStrings(JSON.parse(value.trim()), depth + 1);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    return value.map((entry) => reviveJsonStrings(entry, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        reviveJsonStrings(entry, depth + 1),
      ])
    );
  }
  return value;
}

export function formatWireJson(value: unknown): string {
  try {
    return JSON.stringify(reviveJsonStrings(value) ?? null, null, 2);
  } catch {
    return String(value);
  }
}

const JSON_LEXEME_RE =
  /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;

export function tokenizeJson(source: string): JsonHighlightToken[] {
  const tokens: JsonHighlightToken[] = [];
  let cursor = 0;
  for (const match of source.matchAll(JSON_LEXEME_RE)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ kind: "text", value: source.slice(cursor, index) });
    }
    const lexeme = match[0] ?? "";
    if (lexeme.startsWith('"')) {
      const suffix = lexeme.match(/"(\s*:)$/);
      if (suffix?.[1]) {
        tokens.push({
          kind: "key",
          value: lexeme.slice(0, -suffix[1].length),
        });
        tokens.push({ kind: "punct", value: suffix[1] });
      } else {
        tokens.push({ kind: "string", value: lexeme });
      }
    } else if (lexeme === "true" || lexeme === "false" || lexeme === "null") {
      tokens.push({ kind: "keyword", value: lexeme });
    } else {
      tokens.push({ kind: "number", value: lexeme });
    }
    cursor = index + lexeme.length;
  }
  if (cursor < source.length) {
    tokens.push({ kind: "text", value: source.slice(cursor) });
  }
  return tokens.length > 0 ? tokens : [{ kind: "text", value: source }];
}
