import { useInfiniteQuery } from "@engenty/query-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AuditLogEvent,
  AuditLogFilters,
  FetchAuditEventsFn,
} from "../types.js";

function serializeFilters(f: AuditLogFilters): string {
  return JSON.stringify({
    actor_id: f.actor_id ?? null,
    date_from: f.date_from?.toISOString() ?? null,
    date_to: f.date_to?.toISOString() ?? null,
    module_id: f.module_id ?? null,
    search: f.search ?? null,
    types: f.types ?? null,
  });
}

interface UseAuditLogFeedOptions {
  fetchEvents: FetchAuditEventsFn;
  filters: AuditLogFilters;
  isLive?: boolean;
  pageSize?: number;
  setIsLive?: (value: boolean) => void;
}

export function useAuditLogFeed({
  filters,
  fetchEvents,
  isLive: externalIsLive,
  setIsLive: externalSetIsLive,
  pageSize = 50,
}: UseAuditLogFeedOptions) {
  const [internalIsLive, setInternalIsLive] = useState(true);
  const isLive = externalIsLive ?? internalIsLive;
  const setIsLive = externalSetIsLive ?? setInternalIsLive;

  const filtersKey = serializeFilters(filters);
  const infiniteQuery = useInfiniteQuery({
    queryKey: ["audit-log-feed", filtersKey],
    queryFn: async ({ pageParam, signal }) => {
      const result = await fetchEvents(filters, pageParam as number, signal);
      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.has_more ? allPages.length : undefined,
    retry: 2,
    retryDelay: (attemptIndex) => (attemptIndex + 1) * 400,
  });

  const events: AuditLogEvent[] =
    infiniteQuery.data?.pages
      .flatMap((p) => p.events ?? [])
      ?.filter(
        (e): e is AuditLogEvent => e != null && typeof e?.id === "string"
      ) ?? [];
  const hasMore = infiniteQuery.hasNextPage ?? false;
  const loadMore = useCallback(() => {
    void infiniteQuery.fetchNextPage();
  }, [infiniteQuery]);
  const refresh = useCallback(() => {
    void infiniteQuery.refetch();
  }, [infiniteQuery]);

  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && isLiveRef.current) {
        void infiniteQuery.refetch();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [infiniteQuery]);

  const error =
    infiniteQuery.error instanceof Error
      ? infiniteQuery.error
      : infiniteQuery.error
        ? new Error(String(infiniteQuery.error))
        : null;

  return {
    events,
    isLoading: infiniteQuery.isLoading,
    error: error ?? null,
    hasMore,
    loadMore,
    refresh,
    isLive,
    setIsLive,
  };
}
