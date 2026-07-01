import { useQuery } from "@engenty/query-client";
import { useMemo } from "react";
import type { KbPageArticlesBlock } from "../../../src/schema/page-blocks.js";
import type { KbCategory } from "../../../src/schema/types.js";
import { articlesQueryOptions, categoriesQueryOptions } from "../../queries.js";
import {
  articlesQueryParamsForBlock,
  isKbPageArticlesBlockEmpty,
} from "./page-block-empty.js";

export function useKbPageArticlesBlockEmpty(
  block: KbPageArticlesBlock | null,
  kbId: string,
  categories: KbCategory[],
  categoryId?: string
) {
  const isRecursive =
    block?.source === "latest_created_recursive" ||
    block?.source === "recent_updated_recursive";

  const articlesQuery = useQuery({
    ...(block
      ? articlesQueryOptions(
          articlesQueryParamsForBlock(block, kbId, categoryId)
        )
      : articlesQueryOptions({ kb_id: kbId, page_size: 1 })),
    enabled: block !== null,
  });

  const categoriesQuery = useQuery({
    ...categoriesQueryOptions(kbId),
    enabled: block !== null && (isRecursive || block.grouped_by_category),
  });

  const allCategories = categoriesQuery.data ?? categories;
  const allArticles = articlesQuery.data?.data ?? [];

  const isEmpty = useMemo(() => {
    if (!block) {
      return false;
    }
    return isKbPageArticlesBlockEmpty(
      block,
      allArticles,
      allCategories,
      categoryId
    );
  }, [allArticles, allCategories, block, categoryId]);

  return {
    isEmpty,
    isLoading: block !== null && articlesQuery.isLoading,
  };
}
