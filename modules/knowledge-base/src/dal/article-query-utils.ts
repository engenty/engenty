/** Matches `slugSchema` max length in `schema/shared.ts`. */
export const ARTICLE_SLUG_MAX_LEN = 128;

/** Short tokens + common German/English glue words dropped for lexical recall. */
const KB_LEX_STOPWORDS = new Set([
  "a",
  "an",
  "as",
  "at",
  "be",
  "for",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "am",
  "auf",
  "das",
  "dem",
  "den",
  "der",
  "des",
  "die",
  "ein",
  "eine",
  "einem",
  "einen",
  "einer",
  "eines",
  "ihr",
  "im",
  "ins",
  "ist",
  "mit",
  "oder",
  "sind",
  "und",
  "von",
  "vom",
  "war",
  "wir",
  "zu",
  "zum",
  "zur",
]);

export function kbArticleSearchTokens(query: string): string[] {
  const cleaned = query.replace(/[%_\\]/g, " ").trim();
  if (cleaned.length < 2) {
    return [];
  }
  const raw = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/,/g, "").trim())
    .filter((t) => t.length >= 2 && !KB_LEX_STOPWORDS.has(t.toLowerCase()));
  return [...new Set(raw)].slice(0, 8);
}

/** Strip LIKE wildcards from user text so PostgREST `ilike` patterns stay safe. */
export function sanitizeIlikeToken(token: string): string {
  return token.replace(/[%_\\]/g, "").trim();
}

export function isSafeCustomPropertyKey(key: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key);
}
