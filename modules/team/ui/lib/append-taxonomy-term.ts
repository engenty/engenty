import type { TeamTaxonomyTerm } from "../api.js";
import { resolveImportTaxonomyTerm } from "./import-team-members.js";
import {
  draftsToTaxonomyTermsForSave,
  resolveTaxonomyTermSlug,
} from "./taxonomy-term-save.js";

export class DuplicateTaxonomyTermSlugError extends Error {
  readonly term_slug: string;

  constructor(term_slug: string) {
    super(`Taxonomy slug already exists: ${term_slug}`);
    this.name = "DuplicateTaxonomyTermSlugError";
    this.term_slug = term_slug;
  }
}

/** Merge a new term draft into existing terms for PUT replace. Throws on slug collision. */
export function appendTaxonomyTerm(
  existingTerms: TeamTaxonomyTerm[],
  draft: { label: string; term_slug?: string }
): TeamTaxonomyTerm[] {
  const label = draft.label.trim();
  const [newTerm] = draftsToTaxonomyTermsForSave([
    {
      label,
      sort_order: existingTerms.length,
    },
  ]);
  if (!newTerm) {
    throw new Error("Taxonomy term label is required");
  }

  const term_slug = resolveTaxonomyTermSlug({
    label,
    term_slug: draft.term_slug ?? "",
  });
  if (existingTerms.some((term) => term.term_slug === term_slug)) {
    throw new DuplicateTaxonomyTermSlugError(term_slug);
  }

  return [
    ...existingTerms.map((term, index) => ({
      ...term,
      sort_order: index,
    })),
    {
      ...newTerm,
      parent_term_id: null,
      sort_order: existingTerms.length,
    } as TeamTaxonomyTerm,
  ];
}

/** Resolve or append a taxonomy term without throwing when slug already exists. */
export function appendTaxonomyTermIfMissing(
  existingTerms: TeamTaxonomyTerm[],
  draft: { label: string; term_slug?: string }
): { created: boolean; term_id: string; terms: TeamTaxonomyTerm[] } {
  const label = draft.label.trim();
  if (!label) {
    throw new Error("Taxonomy term label is required");
  }

  const matched = resolveImportTaxonomyTerm(label, existingTerms);
  if (matched) {
    return { terms: existingTerms, term_id: matched, created: false };
  }

  const term_slug = resolveTaxonomyTermSlug({
    label,
    term_slug: draft.term_slug ?? "",
  });
  if (existingTerms.some((term) => term.term_slug === term_slug)) {
    const existing = existingTerms.find((term) => term.term_slug === term_slug);
    return {
      terms: existingTerms,
      term_id: existing?.id ?? term_slug,
      created: false,
    };
  }

  const terms = appendTaxonomyTerm(existingTerms, { label, term_slug });
  const last = terms.at(-1);
  return { terms, term_id: last?.id ?? term_slug, created: true };
}
