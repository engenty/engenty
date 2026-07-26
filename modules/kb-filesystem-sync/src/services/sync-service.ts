/**
 * Incremental sync — keep the OKF tree in step with single-entity changes.
 *
 * Create/update paths load the live entity through the KB repos and rewrite
 * the one affected file. Delete paths (and category moves) can't recompute the
 * old slug-path from a payload, so they locate the stale file by matching its
 * frontmatter `id`, then prune it.
 */

import type { KbRepoFactory } from "@engenty/knowledge-base/dal/contracts";
import type { StorageService } from "@engenty/plugin-sdk";
import { buildCategorySlugChains } from "../okf/category-tree.js";
import { parseOkf } from "../okf/frontmatter.js";
import {
  articleKey,
  categoryIndexKey,
  isIndexKey,
  kbRootKey,
} from "../okf/paths.js";
import { articleToOkf, categoryToOkf, kbToOkf } from "../okf/serialize.js";
import {
  deletePrefix,
  readText,
  walkKeys,
  writeText,
} from "../storage/storage-ops.js";
import { exportKb } from "./export.js";

interface SyncDeps {
  base: string;
  repos: KbRepoFactory;
  storage: StorageService;
}

/** Find the file whose frontmatter `id` matches, optionally limited to index files. */
async function findKeyById(
  storage: StorageService,
  base: string,
  id: string,
  indexOnly: boolean
): Promise<string | null> {
  for (const key of await walkKeys(storage, base)) {
    if (!key.endsWith(".md") || (indexOnly && !isIndexKey(key))) {
      continue;
    }
    const text = await readText(storage, key);
    if (text && parseOkf(text).frontmatter.id === id) {
      return key;
    }
  }
  return null;
}

export async function syncArticleUpsert(
  deps: SyncDeps,
  articleId: string
): Promise<void> {
  const article = await deps.repos.articles.getById(articleId);
  if (!article) {
    return;
  }
  const chains = buildCategorySlugChains(
    await deps.repos.categories.list(article.kb_id)
  );
  const chain = chains.get(article.category_id) ?? [];
  // A slug or category change strands the previous file — drop it first.
  const stale = await findKeyById(deps.storage, deps.base, articleId, false);
  const next = articleKey(deps.base, chain, article.slug);
  if (stale && stale !== next) {
    await deps.storage.delete?.(stale);
  }
  await writeText(deps.storage, next, articleToOkf(article));
}

export async function syncArticleDelete(
  deps: Pick<SyncDeps, "base" | "storage">,
  articleId: string
): Promise<void> {
  const key = await findKeyById(deps.storage, deps.base, articleId, false);
  if (key) {
    await deps.storage.delete?.(key);
  }
}

export async function syncCategoryUpsert(
  deps: SyncDeps,
  categoryId: string,
  kbId: string
): Promise<void> {
  const category = await deps.repos.categories.getById(categoryId);
  if (!category) {
    return;
  }
  const chains = buildCategorySlugChains(
    await deps.repos.categories.list(kbId)
  );
  const chain = chains.get(category.id) ?? [category.slug];
  const next = categoryIndexKey(deps.base, chain);
  const stale = await findKeyById(deps.storage, deps.base, categoryId, true);
  if (stale && stale !== next) {
    // Slug/parent moved: prune the old subtree and re-export so descendant
    // article paths follow the rename.
    await deletePrefix(deps.storage, stale.replace(/\/index\.md$/, ""));
    await exportKb(deps, kbId);
    return;
  }
  await writeText(deps.storage, next, categoryToOkf(category));
}

export async function syncCategoryDelete(
  deps: Pick<SyncDeps, "base" | "storage">,
  categoryId: string
): Promise<void> {
  const key = await findKeyById(deps.storage, deps.base, categoryId, true);
  if (key) {
    await deletePrefix(deps.storage, key.replace(/\/index\.md$/, ""));
  }
}

export async function syncKbUpsert(
  deps: SyncDeps,
  kbId: string
): Promise<void> {
  const kb = await deps.repos.kb.getById(kbId);
  if (kb) {
    await writeText(deps.storage, kbRootKey(deps.base), kbToOkf(kb));
  }
}

export async function syncKbDelete(
  deps: Pick<SyncDeps, "base" | "storage">
): Promise<void> {
  await deletePrefix(deps.storage, deps.base);
}
