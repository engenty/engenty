import {
  prependOptimisticItem,
  removeOptimisticItems,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import type {
  Article,
  Faq,
  PaginatedResponse,
} from "../../src/schema/types.js";
import {
  type ArticlesQuery,
  deleteArticle,
  deleteFaq,
  type FaqsQuery,
  updateArticle,
  updateFaq,
} from "../api.js";
import { invalidateKbGraphQueries } from "./graph.js";
import { kbArticleKeys, kbFaqKeys } from "./keys.js";

export function articleMatches(
  article: Article,
  query: ArticlesQuery
): boolean {
  return (
    article.kb_id === query.kb_id &&
    (!query.category_id || article.category_id === query.category_id) &&
    (!query.parent_article_id ||
      article.parent_article_id === query.parent_article_id) &&
    (!query.status || article.status === query.status) &&
    (!query.search ||
      article.title.toLowerCase().includes(query.search.toLowerCase()))
  );
}

export function faqMatches(faq: Faq, query: FaqsQuery): boolean {
  return (
    faq.kb_id === query.kb_id &&
    (!query.status || faq.status === query.status) &&
    (!query.search ||
      faq.question.toLowerCase().includes(query.search.toLowerCase()))
  );
}

function updateArticleLists(
  queryClient: ReturnType<typeof useQueryClient>,
  update: (
    page: PaginatedResponse<Article>,
    query: ArticlesQuery
  ) => PaginatedResponse<Article>
) {
  for (const [key, current] of queryClient.getQueriesData<
    PaginatedResponse<Article>
  >({ queryKey: kbArticleKeys.all })) {
    if (!current || key[2] !== "with-comment-count") {
      continue;
    }
    queryClient.setQueryData(key, update(current, key.at(-1) as ArticlesQuery));
  }
}

function updateFaqLists(
  queryClient: ReturnType<typeof useQueryClient>,
  update: (
    page: PaginatedResponse<Faq>,
    query: FaqsQuery
  ) => PaginatedResponse<Faq>
) {
  for (const [key, current] of queryClient.getQueriesData<
    PaginatedResponse<Faq>
  >({ queryKey: kbFaqKeys.all })) {
    if (!current) {
      continue;
    }
    queryClient.setQueryData(key, update(current, key.at(-1) as FaqsQuery));
  }
}

function removeFromKbPage<T extends { id: string }>(
  page: PaginatedResponse<T>,
  ids: ReadonlySet<string>
): PaginatedResponse<T> {
  const normalized = removeOptimisticItems(
    {
      data: page.data,
      page: page.page,
      pageSize: page.page_size,
      total: page.total,
    },
    ids
  );
  return normalized
    ? { ...page, data: normalized.data, total: normalized.total }
    : page;
}

export function useDeleteArticleMutation(_listQuery?: ArticlesQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteArticle(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: kbArticleKeys.all });
      updateArticleLists(queryClient, (page) =>
        removeFromKbPage(page, new Set([id]))
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
      toast.error("Could not delete the article. The list is refreshing.");
    },
    onSuccess: async () => {
      await invalidateKbGraphQueries(queryClient);
    },
  });
}

export function useUpdateArticleMutation(_listQuery?: ArticlesQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Record<string, unknown>;
    }) => updateArticle(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: kbArticleKeys.all });
      updateArticleLists(queryClient, (page, query) => {
        const data = page.data.flatMap((article) => {
          if (article.id !== id) {
            return [article];
          }
          const patched = { ...article, ...input };
          return articleMatches(patched, query) ? [patched] : [];
        });
        return {
          ...page,
          data,
          total: page.total - (page.data.length - data.length),
        };
      });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
      toast.error("Could not update the article. The list is refreshing.");
    },
    onSuccess: (saved) => {
      updateArticleLists(queryClient, (page, query) => {
        if (!articleMatches(saved, query)) {
          return removeFromKbPage(page, new Set([saved.id]));
        }
        if (page.data.some((article) => article.id === saved.id)) {
          return {
            ...page,
            data: page.data.map((article) =>
              article.id === saved.id ? saved : article
            ),
          };
        }
        const normalized = prependOptimisticItem(
          {
            data: page.data,
            page: page.page,
            pageSize: page.page_size,
            total: page.total,
          },
          saved
        );
        return normalized
          ? { ...page, data: normalized.data, total: normalized.total }
          : page;
      });
      queryClient.setQueryData(["kb", "articles", "detail", saved.id], saved);
      void queryClient.invalidateQueries({
        queryKey: ["kb", "articles", "versions", saved.id],
      });
      void invalidateKbGraphQueries(queryClient, saved.kb_id);
    },
  });
}

export function useDeleteFaqMutation(_listQuery?: FaqsQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFaq(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: kbFaqKeys.all });
      updateFaqLists(queryClient, (page) =>
        removeFromKbPage(page, new Set([id]))
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: kbFaqKeys.all });
      toast.error("Could not delete the FAQ. The list is refreshing.");
    },
  });
}

export function useUpdateFaqMutation(_listQuery?: FaqsQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Record<string, unknown>;
    }) => updateFaq(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: kbFaqKeys.all });
      updateFaqLists(queryClient, (page, query) => {
        const data = page.data.flatMap((faq) => {
          if (faq.id !== id) {
            return [faq];
          }
          const patched = { ...faq, ...input };
          return faqMatches(patched, query) ? [patched] : [];
        });
        return {
          ...page,
          data,
          total: page.total - (page.data.length - data.length),
        };
      });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: kbFaqKeys.all });
      toast.error("Could not update the FAQ. The list is refreshing.");
    },
    onSuccess: (saved) => {
      updateFaqLists(queryClient, (page) => ({
        ...page,
        data: page.data.map((faq) => (faq.id === saved.id ? saved : faq)),
      }));
      void queryClient.invalidateQueries({
        queryKey: ["kb", "faqs", "versions", saved.id],
      });
    },
  });
}
