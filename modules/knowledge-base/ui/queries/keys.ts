/**
 * Knowledge Base — TanStack Query options.
 */

import { queryOptions } from "@engenty/query-client";
import {
  type ArticlesQuery,
  type FaqsQuery,
  getWorkspaceSetupContext,
  type InboxListQuery,
  type KbSourcesListQuery,
} from "../api.js";

export const kbArticleKeys = {
  all: ["kb", "articles"] as const,
  list: (query: ArticlesQuery) =>
    [...kbArticleKeys.all, "with-comment-count", query] as const,
};

export const workspaceSetupContextQueryOptions = queryOptions({
  queryKey: ["workspace-setup-context"],
  queryFn: ({ signal }) => getWorkspaceSetupContext(signal),
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
});

export const kbFaqKeys = {
  all: ["kb", "faqs"] as const,
  list: (query: FaqsQuery) => [...kbFaqKeys.all, query] as const,
};

export const kbCategoryKeys = {
  all: ["kb", "categories"] as const,
  list: (kbId: string) => [...kbCategoryKeys.all, kbId] as const,
  detail: (id: string) => [...kbCategoryKeys.all, "detail", id] as const,
};

export const kbInboxKeys = {
  all: ["kb", "inbox"] as const,
  detail: (id: string) => [...kbInboxKeys.all, "detail", id] as const,
  list: (query: InboxListQuery) => [...kbInboxKeys.all, "list", query] as const,
};

export const kbSourceKeys = {
  adapters: ["kb", "sources", "adapters"] as const,
  all: ["kb", "sources"] as const,
  detail: (sourceId: string) =>
    [...kbSourceKeys.all, "detail", sourceId] as const,
  items: (
    sourceId: string,
    page: number,
    pageSize: number,
    search = "",
    status = ""
  ) =>
    [
      ...kbSourceKeys.all,
      "items",
      sourceId,
      page,
      pageSize,
      search,
      status,
    ] as const,
  list: (query: KbSourcesListQuery) =>
    [...kbSourceKeys.all, "list", query] as const,
  sourceItem: (itemId: string) =>
    [...kbSourceKeys.all, "source-item", itemId] as const,
};

export const kbTemplateKeys = {
  all: ["kb", "templates"] as const,
  detail: (id: string) => [...kbTemplateKeys.all, "detail", id] as const,
  list: (kbId: string) => [...kbTemplateKeys.all, kbId] as const,
};
