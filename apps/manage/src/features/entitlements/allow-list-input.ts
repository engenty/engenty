/**
 * Parse/format the free-text allow-list inputs.
 *
 * Entries are canonicalised to trimmed-lowercase, matching `canonicalModelId`
 * in `@engenty/ai-core` (`usage/model-allow-list.ts`). This has to agree with
 * the backend exactly: enforcement compares canonical forms, so an entry typed
 * as `OpenAI/GPT-5` that was stored verbatim would match nothing at runtime
 * while looking perfectly correct in the UI. Kept as a local copy rather than a
 * new `@engenty/ai-core` dependency for the manage bundle — if the canonical
 * form ever changes, both must move together.
 */

/** Split on commas/whitespace, canonicalise, drop blanks and duplicates. */
export function parseAllowList(raw: string): string[] {
  const seen = new Set<string>();
  for (const token of raw.split(/[\s,]+/)) {
    const canonical = token.trim().toLowerCase();
    if (canonical.length > 0) {
      seen.add(canonical);
    }
  }
  return [...seen];
}

/** Empty list means "no restriction", which is stored as null, not `[]`. */
export function allowListToStored(raw: string): string[] | null {
  const parsed = parseAllowList(raw);
  return parsed.length > 0 ? parsed : null;
}

export function formatAllowList(values: readonly string[] | null | undefined) {
  return (values ?? []).join(", ");
}

/**
 * Entries that are not in the gateway catalog. Surfaced as a warning rather
 * than a hard error: a routing-prefixed id or a model not yet synced is legal
 * to grant, but a typo silently granting nothing is the failure mode worth
 * catching — that is how `openrouter/openai/gpt-oss-safeguard-20b` ended up in
 * a live allow-list while the catalog only ever had `openai/…`.
 */
export function unknownModelIds(
  values: readonly string[],
  catalogModelIds: readonly string[]
): string[] {
  if (catalogModelIds.length === 0) {
    return [];
  }
  const known = new Set(catalogModelIds.map((id) => id.trim().toLowerCase()));
  return values.filter((value) => !known.has(value));
}
