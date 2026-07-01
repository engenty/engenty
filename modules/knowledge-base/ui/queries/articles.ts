/**
 * Knowledge Base — TanStack Query options.
 */

import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
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
