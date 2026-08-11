import { requestApiJson } from "@engenty/api-client";
import {
  defaultInboxCategories,
  INBOX_CATEGORIES_SETTING_KEY,
  type InboxCategoriesConfig,
  type InboxCategoryItem,
  isFixedInboxCategory,
  mergeInboxCategories,
  normalizeCategorySlug,
} from "../../src/schema/categories.js";

// biome-ignore lint/performance/noBarrelFile: stable UI import path for category helpers
export {
  defaultInboxCategories,
  FIXED_INBOX_CATEGORIES,
  type FixedInboxCategory,
  INBOX_CATEGORIES_SETTING_KEY,
  INBOX_MESSAGE_CATEGORIES,
  type InboxCategoriesConfig,
  type InboxCategoryItem,
  isFixedInboxCategory,
  mergeInboxCategories,
  normalizeCategorySlug,
  visibleInboxCategories,
} from "../../src/schema/categories.js";

export function getCategoryTitleLabel(
  slug: string,
  title: string | undefined,
  t: (key: string) => string
): string {
  if (title?.trim()) {
    return title.trim();
  }
  if (isFixedInboxCategory(slug)) {
    return t(`categories.${slug}`);
  }
  return slug;
}

export async function getInboxCategoriesConfig(
  signal?: AbortSignal
): Promise<InboxCategoriesConfig> {
  const res = await requestApiJson<{
    name: string;
    type: string;
    value: unknown;
  }>(
    `/api/tenant-settings/${encodeURIComponent(INBOX_CATEGORIES_SETTING_KEY)}`,
    {
      method: "GET",
      signal,
    }
  ).catch(() => null);

  if (res?.type === "json") {
    return mergeInboxCategories(res.value);
  }
  return defaultInboxCategories();
}

export async function setInboxCategoriesConfig(
  config: InboxCategoriesConfig
): Promise<InboxCategoriesConfig> {
  const merged = mergeInboxCategories({
    items: config.items.map((item, order) => ({
      ...item,
      order,
      slug: normalizeCategorySlug(item.slug),
    })),
  });
  const deduped: InboxCategoryItem[] = [];
  const seen = new Set<string>();
  for (const item of merged.items) {
    if (!item.slug || seen.has(item.slug)) {
      continue;
    }
    seen.add(item.slug);
    deduped.push({
      order: deduped.length,
      rule: item.rule?.trim() || undefined,
      slug: item.slug,
      title: item.title?.trim() || undefined,
      visible: Boolean(item.visible),
    });
  }
  const finalConfig = mergeInboxCategories({ items: deduped });
  await requestApiJson(
    `/api/tenant-settings/${encodeURIComponent(INBOX_CATEGORIES_SETTING_KEY)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        type: "json",
        value_jsonb: { items: finalConfig.items },
      }),
    }
  );
  return finalConfig;
}
