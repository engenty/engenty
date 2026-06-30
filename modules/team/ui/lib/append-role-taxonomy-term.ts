import type { TeamTaxonomyTerm } from "../api.js";
import {
  appendTaxonomyTerm,
  DuplicateTaxonomyTermSlugError,
} from "./append-taxonomy-term.js";

export class DuplicateRoleTermSlugError extends Error {
  readonly term_slug: string;

  constructor(term_slug: string) {
    super(`Role slug already exists: ${term_slug}`);
    this.name = "DuplicateRoleTermSlugError";
    this.term_slug = term_slug;
  }
}

/** Merge a new role draft into existing terms for PUT replace. */
export function appendRoleTaxonomyTerm(
  existingTerms: TeamTaxonomyTerm[],
  draft: { label: string; term_slug?: string }
): TeamTaxonomyTerm[] {
  try {
    return appendTaxonomyTerm(existingTerms, draft);
  } catch (err) {
    if (err instanceof DuplicateTaxonomyTermSlugError) {
      throw new DuplicateRoleTermSlugError(err.term_slug);
    }
    throw err;
  }
}
