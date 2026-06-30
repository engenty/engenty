import type { TeamTaxonomyTerm } from "../api.js";
import { saveTaxonomyTerms } from "../team-module-queries.js";
import { appendTaxonomyTermIfMissing } from "./append-taxonomy-term.js";
import {
  type ImportTaxonomyContext,
  normalizeImportRowTaxonomyColumns,
  resolveImportTaxonomyTerm,
} from "./import-team-members.js";

export type ImportTaxonomySlug = "location" | "role";

export class ImportTaxonomyEnsurer {
  private termsBySlug: Record<ImportTaxonomySlug, TeamTaxonomyTerm[]>;
  private dirty = false;

  constructor(initial: ImportTaxonomyContext) {
    this.termsBySlug = {
      location: [...initial.locationTerms],
      role: [...initial.roleTerms],
    };
  }

  reset(initial: ImportTaxonomyContext) {
    this.termsBySlug = {
      location: [...initial.locationTerms],
      role: [...initial.roleTerms],
    };
    this.dirty = false;
  }

  getContext(): ImportTaxonomyContext {
    return {
      locationTerms: this.termsBySlug.location,
      roleTerms: this.termsBySlug.role,
    };
  }

  get hasPendingChanges() {
    return this.dirty;
  }

  async ensureTerm(
    taxonomySlug: ImportTaxonomySlug,
    raw: string | undefined
  ): Promise<string | undefined> {
    const trimmed = raw?.trim();
    if (!trimmed) {
      return;
    }

    const terms = this.termsBySlug[taxonomySlug];
    const existing = resolveImportTaxonomyTerm(trimmed, terms);
    if (existing) {
      return existing;
    }

    const { created, terms: merged } = appendTaxonomyTermIfMissing(terms, {
      label: trimmed,
    });
    if (created) {
      const saved = await saveTaxonomyTerms(taxonomySlug, merged);
      this.dirty = true;
      this.termsBySlug[taxonomySlug] = saved;
      return resolveImportTaxonomyTerm(trimmed, saved);
    }
    this.termsBySlug[taxonomySlug] = merged;
    return resolveImportTaxonomyTerm(trimmed, merged);
  }

  async prepareRow(
    row: Record<string, string>
  ): Promise<Record<string, string>> {
    const normalized = normalizeImportRowTaxonomyColumns(row);
    const role_term_id = await this.ensureTerm("role", normalized.role_term);
    const location_term_id = await this.ensureTerm(
      "location",
      normalized.location_term
    );

    return {
      ...normalized,
      ...(role_term_id ? { role_term_id } : {}),
      ...(location_term_id ? { location_term_id } : {}),
    };
  }
}
