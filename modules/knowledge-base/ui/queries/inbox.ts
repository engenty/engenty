/**
 * Knowledge Base — TanStack Query options.
 */

import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@engenty/query-client";
import { getInboxItem, type InboxListQuery, listInbox } from "../api.js";

import { kbInboxKeys } from "./keys.js";

export function inboxListQueryOptions(query: InboxListQuery) {
  return queryOptions({
    queryKey: kbInboxKeys.list(query),
    queryFn: ({ signal }) => listInbox(query, signal),
    enabled: !!query.kb_id,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function inboxDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: kbInboxKeys.detail(id),
    queryFn: ({ signal }) => getInboxItem(id, signal),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useInboxListQuery(query: InboxListQuery) {
  return useQuery(inboxListQueryOptions(query));
}
