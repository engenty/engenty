/**
 * Knowledge Base — TanStack Query options.
 */

import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@engenty/query-client";
import { type ArticlesQuery, type FaqsQuery, listFaqs } from "../api.js";
import { articlesQueryOptions } from "./articles.js";
import { kbFaqKeys } from "./keys.js";

/* ── FAQs ── */

export function faqsQueryOptions(query: FaqsQuery) {
  return queryOptions({
    queryKey: kbFaqKeys.list(query),
    queryFn: ({ signal }) => listFaqs(query, signal),
    enabled: !!query.kb_id,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useArticlesListQuery(query: ArticlesQuery) {
  return useQuery(articlesQueryOptions(query));
}

export function useFaqsListQuery(query: FaqsQuery) {
  return useQuery(faqsQueryOptions(query));
}
