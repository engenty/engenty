export interface TaxonomyTermLabelSource {
  id: string;
  label: string;
  term_slug: string;
}

export function resolveTaxonomyTermLabel(
  terms: readonly TaxonomyTermLabelSource[],
  termIdOrSlug: string | null | undefined,
  emptyLabel: string
): string {
  const value = termIdOrSlug?.trim();
  if (!value) {
    return emptyLabel;
  }
  const term = terms.find(
    (item) => item.id === value || item.term_slug === value
  );
  return term?.label ?? value;
}
