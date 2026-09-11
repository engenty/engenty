/**
 * Knowledge Base — TanStack Query options.
 */

import {
  keepPreviousData,
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type { Article } from "../../src/schema/types.js";
import {
  type ArticlesQuery,
  createArticleComment,
  deleteArticleComment,
  fetchArticleCommentCounts,
  getArticle,
  getArticleVersion,
  listArticleComments,
  listArticles,
  listArticleVersions,
  updateArticleComment,
} from "../api.js";
import { kbArticleKeys } from "./keys.js";

/* ── Articles ── */

export function articlesQueryOptions(query: ArticlesQuery) {
  return queryOptions({
    queryKey: kbArticleKeys.list(query),
    queryFn: ({ signal }) => listArticles(query, signal),
    enabled: !!query.kb_id,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function articleDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["kb", "articles", "detail", id],
    queryFn: ({ signal }) => getArticle(id, signal),
    enabled: !!id,
    staleTime: 15_000,
  });
}

function isCachedArticleRow(value: unknown): value is Article {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Partial<Article>;
  return (
    typeof row.id === "string" &&
    typeof row.kb_id === "string" &&
    typeof row.title === "string"
  );
}

function cachedArticleRows(value: unknown): Article[] {
  const page = value as { data?: unknown } | null;
  if (page && typeof page === "object" && Array.isArray(page.data)) {
    return page.data.filter(isCachedArticleRow);
  }
  return isCachedArticleRow(value) ? [value] : [];
}

/**
 * An article already sitting in the query cache, addressed by id or by slug.
 *
 * The list endpoint returns whole rows — title, summary, body, properties — so
 * once the sidebar tree has loaded, everything the reader paints first is in
 * cache before the detail request is even sent. The detail payload only adds
 * the navigation context, attachments, source references and the `effective_*`
 * resolutions, which is why it can arrive a beat later without a skeleton.
 */
export function findCachedArticle(
  queryClient: QueryClient,
  idOrSlug: string
): Article | undefined {
  if (!idOrSlug) {
    return;
  }
  let listRow: Article | undefined;
  for (const [key, value] of queryClient.getQueriesData({
    queryKey: kbArticleKeys.all,
  })) {
    for (const row of cachedArticleRows(value)) {
      if (row.id !== idOrSlug && row.slug !== idOrSlug) {
        continue;
      }
      // A detail payload carries the resolutions a list row cannot; it is
      // reachable here when the article was opened under its other address.
      if (key[2] === "detail") {
        return row;
      }
      listRow ??= row;
    }
  }
  return listRow;
}

/** Article detail, painted from the cached list row until the request lands. */
export function useArticleDetailQuery(idOrSlug: string) {
  const queryClient = useQueryClient();
  return useQuery({
    ...articleDetailQueryOptions(idOrSlug),
    placeholderData: () => findCachedArticle(queryClient, idOrSlug),
  });
}

export const kbArticleCommentKeys = {
  all: ["kb", "article-comments"] as const,
  list: (articleId: string) =>
    [...kbArticleCommentKeys.all, articleId] as const,
  counts: (articleIds: string[]) =>
    [
      ...kbArticleCommentKeys.all,
      "counts",
      [...articleIds].sort().join(","),
    ] as const,
};

export function articleCommentCountsQueryOptions(articleIds: string[]) {
  const ids = [...new Set(articleIds.filter(Boolean))].sort();
  return queryOptions({
    queryKey: kbArticleCommentKeys.counts(ids),
    queryFn: ({ signal }) => fetchArticleCommentCounts(ids, signal),
    enabled: ids.length > 0,
    staleTime: 10_000,
  });
}

export function articleCommentsQueryOptions(articleId: string) {
  return queryOptions({
    queryKey: kbArticleCommentKeys.list(articleId),
    queryFn: ({ signal }) => listArticleComments(articleId, signal),
    enabled: !!articleId,
    staleTime: 10_000,
  });
}

export function useArticleCommentsMutations(articleId: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: kbArticleCommentKeys.all,
    });
    await queryClient.invalidateQueries({
      queryKey: articleDetailQueryOptions(articleId).queryKey,
    });
    await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
  };
  return {
    create: useMutation({
      mutationFn: (content: string) => createArticleComment(articleId, content),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        commentId,
        content,
      }: {
        commentId: string;
        content: string;
      }) => updateArticleComment(commentId, content),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (commentId: string) => deleteArticleComment(commentId),
      onSuccess: invalidate,
    }),
  };
}

export function articleVersionsListQueryOptions(articleId: string) {
  return queryOptions({
    queryKey: ["kb", "articles", "versions", articleId],
    queryFn: ({ signal }) => listArticleVersions(articleId, signal),
    enabled: !!articleId,
    staleTime: 15_000,
  });
}

export function articleVersionDetailQueryOptions(
  articleId: string,
  version: number | null
) {
  return queryOptions({
    queryKey: ["kb", "articles", "versions", articleId, "detail", version],
    queryFn: ({ signal }) => getArticleVersion(articleId, version!, signal),
    enabled: !!articleId && version != null && version >= 1,
    staleTime: 60_000,
  });
}
