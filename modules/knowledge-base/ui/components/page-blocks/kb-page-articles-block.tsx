/**
 * Articles block renderer — cards, list, or grouped by category.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { cn, Skeleton } from "@engenty/ui-core";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { KbPageArticlesBlock } from "../../../src/schema/page-blocks.js";
import type { Article, KbCategory } from "../../../src/schema/types.js";
import { kbArticlePath } from "../../kb-paths.js";
import {
  kbFlatRowLinkFlexClass,
  kbFlatRowListClassName,
  kbFlatRowMetaClass,
  kbFlatTileLinkClass,
  kbFlatTileTitleClass,
} from "../../lib/kb-flat-list-styles.js";
import { kbHubSectionHeadingClassName } from "../../lib/kb-page-shell.js";
import { articlesQueryParamsForBlock } from "../../lib/page-blocks/page-block-empty.js";
import {
  groupArticlesByCategory,
  resolveArticlesForBlock,
} from "../../lib/page-blocks/resolve-articles-for-block.js";
import {
  articleCommentCountsQueryOptions,
  articlesQueryOptions,
  categoriesQueryOptions,
} from "../../queries.js";
import { KbArticleFlatRowDate } from "../kb-article-flat-row-date.js";
import { KbArticleFlatRowTitle } from "../kb-article-flat-row-title.js";

export interface KbPageArticlesBlockViewProps {
  block: KbPageArticlesBlock;
  categories: KbCategory[];
  categoryId?: string;
  editable?: boolean;
  kbId: string;
}

function ArticleRow({
  article,
  categoryIcon,
  showDescription,
  showIcon,
}: {
  article: Article;
  categoryIcon: string | null;
  showDescription: boolean;
  showIcon: boolean;
}) {
  return (
    <Link className={kbFlatRowLinkFlexClass} to={kbArticlePath(article.id)}>
      <div className="flex min-w-0 items-center gap-2">
        {showIcon && categoryIcon ? (
          <span aria-hidden className="shrink-0 text-base">
            {categoryIcon}
          </span>
        ) : null}
        <KbArticleFlatRowTitle article={article} />
      </div>
      <KbArticleFlatRowDate iso={article.updated_at} />
      {showDescription && article.summary ? (
        <p className={cn("line-clamp-1 w-full", kbFlatRowMetaClass)}>
          {article.summary}
        </p>
      ) : null}
    </Link>
  );
}

export function KbPageArticlesBlockView({
  block,
  kbId,
  categories,
  categoryId,
  editable = false,
}: KbPageArticlesBlockViewProps) {
  const { t } = useTranslation("kb");

  const isRecursive =
    block.source === "latest_created_recursive" ||
    block.source === "recent_updated_recursive";

  const articlesQuery = useQuery({
    ...articlesQueryOptions(
      articlesQueryParamsForBlock(block, kbId, categoryId)
    ),
  });

  const categoriesQuery = useQuery({
    ...categoriesQueryOptions(kbId),
    enabled: isRecursive || block.grouped_by_category,
  });

  const allCategories = categoriesQuery.data ?? categories;
  const allArticles = articlesQuery.data?.data ?? [];

  const categoryById = useMemo(
    () => new Map(allCategories.map((c) => [c.id, c])),
    [allCategories]
  );

  const articles = useMemo(
    () =>
      resolveArticlesForBlock({
        block,
        allArticles,
        categories: allCategories,
        categoryId,
      }),
    [allArticles, allCategories, block, categoryId]
  );

  const articleIds = useMemo(() => articles.map((a) => a.id), [articles]);
  const { data: commentCounts = {} } = useQuery(
    articleCommentCountsQueryOptions(articleIds)
  );

  const articlesWithCounts = useMemo(
    () =>
      articles.map((a) => ({
        ...a,
        comment_count: commentCounts[a.id] ?? a.comment_count ?? 0,
      })),
    [articles, commentCounts]
  );

  if (articlesQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton className="h-8 w-full max-w-md" key={i} />
        ))}
      </div>
    );
  }

  if (articlesWithCounts.length === 0) {
    if (!editable) {
      return null;
    }
    return <p className="text-muted-foreground text-sm">{t("list.empty")}</p>;
  }

  if (block.grouped_by_category || block.source === "grouped_by_category") {
    const groups = groupArticlesByCategory(articlesWithCounts, allCategories);
    return (
      <div className="space-y-6">
        {groups.map(({ category, articles: groupArticles }) => (
          <section className="space-y-2" key={category?.id ?? "uncategorized"}>
            {category ? (
              <h3 className={kbHubSectionHeadingClassName}>
                <span className="inline-flex items-center gap-2">
                  {block.show_icon && category.icon ? (
                    <span aria-hidden className="text-base">
                      {category.icon}
                    </span>
                  ) : null}
                  {category.name}
                </span>
              </h3>
            ) : null}
            <ul className={kbFlatRowListClassName}>
              {groupArticles.map((a) => (
                <li key={a.id}>
                  <ArticleRow
                    article={a}
                    categoryIcon={categoryById.get(a.category_id)?.icon ?? null}
                    showDescription={block.show_description}
                    showIcon={block.show_icon}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  if (block.style === "list") {
    return (
      <ul className={kbFlatRowListClassName}>
        {articlesWithCounts.map((a) => (
          <li key={a.id}>
            <ArticleRow
              article={a}
              categoryIcon={categoryById.get(a.category_id)?.icon ?? null}
              showDescription={block.show_description}
              showIcon={block.show_icon}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {articlesWithCounts.map((a) => (
        <Link
          className={kbFlatTileLinkClass}
          key={a.id}
          to={kbArticlePath(a.id)}
        >
          <div className="flex min-w-0 items-center gap-2">
            {block.show_icon && categoryById.get(a.category_id)?.icon ? (
              <span aria-hidden className="shrink-0 text-base">
                {categoryById.get(a.category_id)?.icon}
              </span>
            ) : null}
            <KbArticleFlatRowTitle
              article={a}
              titleClassName={kbFlatTileTitleClass}
            />
          </div>
          {block.show_description && a.summary ? (
            <p className={cn("line-clamp-2", kbFlatRowMetaClass)}>
              {a.summary}
            </p>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
