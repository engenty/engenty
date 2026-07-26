/**
 * Export — dump the DB state of one KB to the OKF file tree.
 *
 * Reads go through the Knowledge Base repos (typed, content-resolved); writes
 * go straight to storage. Nothing here emits KB events, so an export never
 * feeds back into the incremental sync path.
 */

import type { KbRepoFactory } from "@engenty/knowledge-base/dal/contracts";
import type { StorageService } from "@engenty/plugin-sdk";
import { buildCategorySlugChains } from "../okf/category-tree.js";
import { articleKey, categoryIndexKey, kbRootKey } from "../okf/paths.js";
import { articleToOkf, categoryToOkf, kbToOkf } from "../okf/serialize.js";
import { writeText } from "../storage/storage-ops.js";

export interface ExportResult {
  articles: number;
  categories: number;
  kb_id: string;
}

const PAGE_SIZE = 100;

export async function exportKb(
  deps: { base: string; repos: KbRepoFactory; storage: StorageService },
  kbId: string
): Promise<ExportResult> {
  const { base, repos, storage } = deps;

  const kb = await repos.kb.getById(kbId);
  if (!kb) {
    throw new Error(`Knowledge base not found: ${kbId}`);
  }
  await writeText(storage, kbRootKey(base), kbToOkf(kb));

  const categories = await repos.categories.list(kbId);
  const chains = buildCategorySlugChains(categories);
  for (const category of categories) {
    const chain = chains.get(category.id) ?? [category.slug];
    await writeText(
      storage,
      categoryIndexKey(base, chain),
      categoryToOkf(category)
    );
  }

  let page = 1;
  let articles = 0;
  for (;;) {
    const result = await repos.articles.listPaginated({
      kb_id: kbId,
      page,
      page_size: PAGE_SIZE,
    });
    for (const article of result.data) {
      const chain = chains.get(article.category_id) ?? [];
      await writeText(
        storage,
        articleKey(base, chain, article.slug),
        articleToOkf(article)
      );
      articles++;
    }
    if (page * PAGE_SIZE >= result.total || result.data.length === 0) {
      break;
    }
    page++;
  }

  return { kb_id: kbId, categories: categories.length, articles };
}
