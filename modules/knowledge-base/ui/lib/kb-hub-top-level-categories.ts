import type { KbCategory } from "../../src/schema/types.js";

/** Root categories on the KB hub — excludes the seeded default bucket. */
export function listTopLevelCategories(
  categories: KbCategory[],
  limit = 6
): KbCategory[] {
  return categories
    .filter((c) => c.parent_id === null && !c.is_default)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
