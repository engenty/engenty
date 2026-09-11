/**
 * Keep only the fields the caller actually sent.
 *
 * The update schemas are `<create>.partial()`, and **`.partial()` does not
 * stop `.default()` from firing**: parsing `{ title: "x" }` returns the
 * invented defaults beside it (`status: "draft"`, `sort_order: 0`,
 * `questions_answered: []`, …), so a rename would also unpublish, re-sort and
 * wipe tags — silently, in one round trip. This bit `kb_article_update` first;
 * the FAQ and category lanes share the schema shape, so every update path
 * (AI gateway and HTTP) filters through here.
 *
 * Validation still runs against the full schema (a bad value is still
 * refused), but only keys present in the caller's own raw patch are applied.
 * Filter off the RAW input, not the parsed one — after parsing, invented
 * defaults are indistinguishable from fields the caller sent.
 */
export function onlyRequestedKeys<T extends Record<string, unknown>>(
  requested: unknown,
  validated: T
): T {
  const sent = new Set(
    Object.keys((requested ?? {}) as Record<string, unknown>)
  );
  return Object.fromEntries(
    Object.entries(validated).filter(([key]) => sent.has(key))
  ) as T;
}
