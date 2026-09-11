/**
 * Categories block renderer — cards or list with optional nested articles.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { cn, Skeleton } from "@engenty/ui-core";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { KbPageCategoriesBlock } from "../../../src/schema/page-blocks.js";
import type { KbCategory } from "../../../src/schema/types.js";
import { kbArticlePath, kbCategoryPath } from "../../kb-paths.js";
import {
  kbFlatRowLinkClass,
  kbFlatRowListClassName,
  kbFlatRowMetaClass,
  kbTopicTeaserCardLinkClass,
  kbTopicTeaserTitleClass,
} from "../../lib/kb-flat-list-styles.js";
import {
  buildArticleCategoryIdIndex,
  computeCategoryArticleCounts,
} from "../../lib/page-blocks/category-article-counts.js";
import {
  categoryCountNeedsArticles,
  renderCategoryCountLabel,
} from "../../lib/page-blocks/category-count-label.js";
import { resolveArticlesForBlock } from "../../lib/page-blocks/resolve-articles-for-block.js";
import { resolveCategoriesForBlock } from "../../lib/page-blocks/resolve-categories-for-block.js";
import { articlesQueryOptions } from "../../queries.js";

export interface KbPageCategoriesBlockViewProps {
  block: KbPageCategoriesBlock;
  categories: KbCategory[];
  editable?: boolean;
  kbId: string;
  parentCategoryId: string | null;
}

export function KbPageCategoriesBlockView({
  block,
  categories,
  kbId,
  parentCategoryId,
  editable = false,
}: KbPageCategoriesBlockViewProps) {
  const { t } = useTranslation("kb");

  const resolved = useMemo(
    () =>
      resolveCategoriesForBlock(block, {
        categories,
        parentCategoryId,
      }),
    [block, categories, parentCategoryId]
  );

  const needsArticles =
    categoryCountNeedsArticles(block.category_count_display) ||
    block.show_articles;

  const allArticlesQuery = useQuery({
    ...articlesQueryOptions({ kb_id: kbId, page_size: 500 }),
    enabled: needsArticles,
  });
  const allArticles = allArticlesQuery.data?.data ?? [];
  const categoryIdIndex = useMemo(
    () => buildArticleCategoryIdIndex(allArticles),
    [allArticles]
  );

  if (resolved.length === 0) {
    if (!editable) {
      return null;
    }
    return (
      <p className="text-muted-foreground text-sm">
        {t("page_blocks.categories.empty")}
      </p>
    );
  }

  if (block.style === "list") {
    return (
      <ul className={kbFlatRowListClassName}>
        {resolved.map((category) => {
          const counts = computeCategoryArticleCounts(
            category.id,
            categories,
            categoryIdIndex
          );
          const countLabel = renderCategoryCountLabel(
            t,
            counts.direct,
            counts.recursive,
            block.category_count_display
          );
          const nestedArticles = block.show_articles
            ? resolveArticlesForBlock({
                block: {
                  id: block.id,
                  type: "articles",
                  visible: true,
                  headline: null,
                  style: "list",
                  grouped_by_category: false,
                  show_icon: false,
                  show_description: false,
                  source: "direct_sorted",
                  sort_by: block.articles_sort_by,
                  max_items: block.articles_max_items,
                  include_drafts: block.articles_include_drafts,
                  manual_article_ids: [],
                  property_filters: {},
                },
                allArticles,
                categories,
                categoryId: category.id,
              })
            : [];

          return (
            <li className="space-y-1" key={category.id}>
              <Link
                className={kbFlatRowLinkClass}
                to={kbCategoryPath(category.slug)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {block.show_icon && category.icon ? (
                    <span aria-hidden className="shrink-0 text-base">
                      {category.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {category.name}
                  </span>
                </div>
                {block.show_description && category.description ? (
                  <p className={cn("line-clamp-1", kbFlatRowMetaClass)}>
                    {category.description}
                  </p>
                ) : null}
                {allArticlesQuery.isLoading ? (
                  <Skeleton className="h-3.5 w-16" />
                ) : countLabel ? (
                  <p className={kbFlatRowMetaClass}>{countLabel}</p>
                ) : null}
              </Link>
              {nestedArticles.length > 0 ? (
                <ul className="ml-4 divide-y divide-border-soft border-border-soft border-l pl-3">
                  {nestedArticles.map((article) => (
                    <li key={article.id}>
                      <Link
                        className="block py-1.5 text-sm hover:underline"
                        to={kbArticlePath(article.id)}
                      >
                        {article.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {resolved.map((category) => {
        const counts = computeCategoryArticleCounts(
          category.id,
          categories,
          categoryIdIndex
        );
        const countLabel = renderCategoryCountLabel(
          t,
          counts.direct,
          counts.recursive,
          block.category_count_display
        );

        return (
          <Link
            className={kbTopicTeaserCardLinkClass}
            key={category.id}
            to={kbCategoryPath(category.slug)}
          >
            <div className="flex min-w-0 items-center gap-2">
              {block.show_icon && category.icon ? (
                <span aria-hidden className="shrink-0 text-base">
                  {category.icon}
                </span>
              ) : null}
              <p className={kbTopicTeaserTitleClass}>{category.name}</p>
            </div>
            {block.show_description && category.description ? (
              <p className="line-clamp-2 text-muted-foreground text-sm leading-snug">
                {category.description}
              </p>
            ) : null}
            {allArticlesQuery.isLoading ? (
              <Skeleton className="mt-auto h-3.5 w-16 pt-2" />
            ) : countLabel ? (
              <p className={cn(kbFlatRowMetaClass, "mt-auto pt-2")}>
                {countLabel}
              </p>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
