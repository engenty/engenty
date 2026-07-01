import type { ModuleLiveBinding } from "@engenty/live-cache";

/**
 * Reactive-data declaration for the knowledge-base list/detail pages. Root is the
 * literal ["kb"] so a change to an article or category invalidates the whole KB
 * query subtree (articles, categories, …). The KB sidebar keeps its own per-page
 * mount; this adds the article/category list + detail pages to the global mount.
 * articles/categories are already in the realtime publication.
 */
export const kbLiveBinding: ModuleLiveBinding = {
  id: "knowledge-base",
  queryRoot: ["kb"],
  postgresChanges: [
    { schema: "module_kb", table: "articles" },
    { schema: "module_kb", table: "categories" },
  ],
};
