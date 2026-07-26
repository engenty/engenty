/**
 * Import — reconstruct DB rows from the OKF file tree.
 *
 * Dependency order is enforced by structure: the KB root is upserted first,
 * then categories shallowest-first (a parent folder always has fewer path
 * segments than its children), then articles. This satisfies the
 * `kb_id` / `parent_id` / `category_id` foreign keys without a DAG.
 */

import type { StorageService } from "@engenty/plugin-sdk";
import type { OkfStore } from "../db/okf-store.js";
import { parseOkf } from "../okf/frontmatter.js";
import { isIndexKey, kbRootKey } from "../okf/paths.js";
import { readText, walkKeys } from "../storage/storage-ops.js";

export interface ImportResult {
  articles: number;
  categories: number;
  kb_imported: boolean;
}

function depth(key: string): number {
  return key.split("/").length;
}

export async function importKb(
  deps: { base: string; storage: StorageService; store: OkfStore },
  _kbId: string
): Promise<ImportResult> {
  const { base, storage, store } = deps;
  const rootKey = kbRootKey(base);
  const keys = await walkKeys(storage, base);

  const categoryKeys = keys
    .filter((k) => isIndexKey(k) && k !== rootKey)
    .sort((a, b) => depth(a) - depth(b));
  const articleKeys = keys.filter((k) => k.endsWith(".md") && !isIndexKey(k));

  const result: ImportResult = {
    kb_imported: false,
    categories: 0,
    articles: 0,
  };

  const rootText = await readText(storage, rootKey);
  if (rootText) {
    const { frontmatter, body } = parseOkf(rootText);
    await store.upsertKb(frontmatter, body);
    result.kb_imported = true;
  }

  for (const key of categoryKeys) {
    const text = await readText(storage, key);
    if (!text) {
      continue;
    }
    const { frontmatter, body } = parseOkf(text);
    await store.upsertCategory(frontmatter, body);
    result.categories++;
  }

  for (const key of articleKeys) {
    const text = await readText(storage, key);
    if (!text) {
      continue;
    }
    const { frontmatter, body } = parseOkf(text);
    await store.upsertArticle(frontmatter, body);
    result.articles++;
  }

  return result;
}
