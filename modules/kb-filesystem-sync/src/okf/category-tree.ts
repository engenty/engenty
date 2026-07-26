/**
 * Resolve each category to its folder path (the chain of ancestor slugs). The
 * OKF folder for a category is `<parent slugs…>/<own slug>`.
 */

import type { KbCategory } from "@engenty/knowledge-base/schema/types";

export type CategorySlugChains = Map<string, string[]>;

/** Build a `categoryId → [slug, …]` map from a flat category list. */
export function buildCategorySlugChains(
  categories: KbCategory[]
): CategorySlugChains {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const chains: CategorySlugChains = new Map();

  const resolve = (id: string, seen: Set<string>): string[] => {
    const cached = chains.get(id);
    if (cached) {
      return cached;
    }
    const cat = byId.get(id);
    if (!cat || seen.has(id)) {
      return [];
    }
    seen.add(id);
    const parentChain = cat.parent_id
      ? resolve(cat.parent_id, seen)
      : ([] as string[]);
    const chain = [...parentChain, cat.slug];
    chains.set(id, chain);
    return chain;
  };

  for (const cat of categories) {
    resolve(cat.id, new Set());
  }
  return chains;
}
