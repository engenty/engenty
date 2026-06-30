import type {
  TeamTaxonomy,
  TeamTaxonomyTerm,
  TeamTaxonomyTermNode,
} from "../schema/taxonomies.js";

export function assertNoTermCycle(
  terms: Pick<TeamTaxonomyTerm, "id" | "parent_term_id">[],
  termId: string,
  nextParentId: string | null
): void {
  if (!nextParentId) {
    return;
  }
  if (nextParentId === termId) {
    throw new Error("Term cannot be its own parent");
  }
  const byId = new Map(terms.map((t) => [t.id, t]));
  let current: string | null = nextParentId;
  const visited = new Set<string>();
  while (current) {
    if (current === termId) {
      throw new Error("Taxonomy term cycle detected");
    }
    if (visited.has(current)) {
      break;
    }
    visited.add(current);
    current = byId.get(current)?.parent_term_id ?? null;
  }
}

export function sortTerms(
  terms: TeamTaxonomyTerm[],
  taxonomy: Pick<TeamTaxonomy, "supports_order">
): TeamTaxonomyTerm[] {
  const copy = [...terms];
  if (taxonomy.supports_order) {
    copy.sort(
      (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
    );
  } else {
    copy.sort((a, b) => a.label.localeCompare(b.label));
  }
  return copy;
}

export function buildTermTree(
  terms: TeamTaxonomyTerm[],
  taxonomy: Pick<TeamTaxonomy, "supports_hierarchy" | "supports_order">
): TeamTaxonomyTermNode[] {
  if (!taxonomy.supports_hierarchy) {
    return sortTerms(terms, taxonomy).map((t) => ({ ...t, children: [] }));
  }

  const byParent = new Map<string | null, TeamTaxonomyTerm[]>();
  for (const term of terms) {
    const key = term.parent_term_id;
    const list = byParent.get(key) ?? [];
    list.push(term);
    byParent.set(key, list);
  }

  const build = (parentId: string | null): TeamTaxonomyTermNode[] => {
    const siblings = byParent.get(parentId) ?? [];
    const sorted = sortTerms(siblings, taxonomy);
    return sorted.map((t) => ({
      ...t,
      children: build(t.id),
    }));
  };

  return build(null);
}

export function validateTermWrite(
  taxonomy: TeamTaxonomy,
  parentTermId: string | null
): void {
  if (parentTermId && !taxonomy.supports_hierarchy) {
    throw new Error("Hierarchy not supported for this taxonomy");
  }
}
