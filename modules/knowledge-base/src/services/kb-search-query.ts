/**
 * KB lexical / FTS query shaping — mirrors the contacts `deriveContactSearchQueryVariants`
 * idea (full phrase + Unicode word tokens) so German compounds and multi-word queries
 * fan out like hybrid contact search.
 */

const MAX_KB_QUERY_VARIANTS = 12;

function pushUnique(values: string[], value: string): void {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return;
  }
  if (
    !values.some(
      (existing) => existing.toLowerCase() === normalized.toLowerCase()
    )
  ) {
    values.push(normalized);
  }
}

/** Full query plus per-token variants (letters/numbers, any script), deduped. */
export function deriveKbSearchQueryVariants(search: string): string[] {
  const trimmed = search.trim();
  if (!trimmed) {
    return [];
  }
  const variants: string[] = [];
  pushUnique(variants, trimmed);
  for (const token of trimmed.split(/[^\p{L}\p{N}]+/u)) {
    pushUnique(variants, token);
  }
  return variants.slice(0, MAX_KB_QUERY_VARIANTS);
}
