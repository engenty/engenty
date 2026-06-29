import {
  Button,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Pause, Play, ScrollText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuditLogFeed } from "../hooks/use-audit-log-feed.js";
import type {
  AuditLogEvent,
  FetchAuditEventsFn,
  FetchFilterOptionsFn,
  AuditLogFilters as Filters,
} from "../types.js";
import { AuditLogEntry } from "./audit-log-entry.js";
import { AuditLogFilters } from "./audit-log-filters.js";

interface AuditLogViewerProps {
  fetchEvents: FetchAuditEventsFn;
  fetchFilterOptions?: FetchFilterOptionsFn;
  labels?: Partial<{
    feedPaused: string;
    newEvents: string;
    resume: string;
    noLogs: string;
    entries: string;
    realtimeConnected: string;
    metadata: string;
    searchPlaceholder: string;
    from: string;
    to: string;
    targetType: string;
    allTypes: string;
    clearFilters: string;
    columnTime: string;
    columnStatus: string;
    columnActor: string;
    columnEvent: string;
    columnSource: string;
  }>;
  refreshTrigger?: number;
}

export function AuditLogViewer({
  fetchEvents,
  fetchFilterOptions,
  refreshTrigger = 0,
  labels = {},
}: AuditLogViewerProps) {
  const [filters, setFilters] = useState<Filters>({});
  const [isLive, setIsLive] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { events, isLoading, hasMore, loadMore, refresh } = useAuditLogFeed({
    filters,
    fetchEvents,
    isLive,
    setIsLive,
  });

  const safeEvents = useMemo(
    () =>
      (events ?? []).filter(
        (ev): ev is AuditLogEvent =>
          ev != null &&
          typeof ev === "object" &&
          typeof (ev as { id?: unknown }).id === "string"
      ),
    [events]
  );

  const feedFilterOptions = fetchFilterOptions
    ? () => fetchFilterOptions()
    : undefined;

  useEffect(() => {
    if (autoScroll && isLive && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [safeEvents.length, autoScroll, isLive]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      refresh();
    }
  }, [refreshTrigger, refresh]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      if (target.scrollTop > 50) {
        setAutoScroll(false);
      } else {
        setAutoScroll(true);
      }

      const scrollable = target.scrollHeight > target.clientHeight + 24;
      if (!scrollable) {
        return;
      }
      const nearBottom =
        target.scrollHeight - target.scrollTop - target.clientHeight < 200;
      if (nearBottom && !isLoading && hasMore) {
        loadMore();
      }
    },
    [isLoading, hasMore, loadMore]
  );

  const {
    feedPaused = "Live feed paused",
    newEvents = "new",
    resume = "Resume",
    noLogs = "No logs",
    entries = "entries",
    realtimeConnected = "Live",
    metadata = "Metadata",
    columnTime = "Time",
    columnStatus = "Status",
    columnActor = "Actor",
    columnEvent = "Event",
    columnSource = "Source",
    ...filterLabels
  } = labels;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AuditLogFilters
        fetchFilterOptions={feedFilterOptions}
        filters={filters}
        labels={filterLabels}
        onFiltersChange={setFilters}
      />

      {!isLive && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border bg-amber-500/10 px-4 py-2 text-amber-700 dark:text-amber-400">
          <div className="flex items-center gap-2 font-medium text-sm">
            <Pause className="h-4 w-4" />
            {feedPaused}
          </div>
          <Button
            className="gap-1.5"
            onClick={() => setIsLive(true)}
            size="sm"
            variant="outline"
          >
            <Play className="h-3.5 w-3.5" />
            {resume}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={handleScroll}
          ref={scrollRef}
        >
          {safeEvents.length === 0 && !isLoading ? (
            <Empty className="border-0 p-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScrollText />
                </EmptyMedia>
                <EmptyTitle>{noLogs}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="sticky top-0 z-10 grid grid-cols-[7rem_6rem_2.5rem_1fr_auto] items-center gap-4 border-border/60 border-b bg-muted/60 px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider backdrop-blur-sm">
                <span>{columnTime}</span>
                <span>{columnStatus}</span>
                <span>{columnActor}</span>
                <span>{columnEvent}</span>
                <span>{columnSource}</span>
              </div>
              {safeEvents.map((ev) => (
                <AuditLogEntry key={ev.id} labelMetadata={metadata} log={ev} />
              ))}
              {isLoading && (
                <div className="flex items-center justify-center border-border/60 border-b py-6">
                  <AnimatedLoaderIcon
                    className="text-muted-foreground"
                    play="always"
                    size="md"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2 text-muted-foreground text-xs">
          <span>
            {safeEvents.length} {entries}
          </span>
          {isLive && (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
              </span>
              {realtimeConnected}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
