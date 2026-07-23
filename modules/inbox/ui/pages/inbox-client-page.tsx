// The mail client: master-detail over the synced local store. Lanes and the
// account filter live in the shell secondary nav (see InboxSidebarPanel) and
// travel as `?lane=` / `?account=` search params; the selected thread is the
// `/mdl/inbox/:threadId` route param so it deep-links.

import { useEngentyFrontendTool } from "@engenty/ai-ui";
import {
  createFrontendToolDefinition,
  PaneResizeHandle,
  useCopilotShell,
  usePersistedEwResizePaneWidth,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  cn,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  ScrollArea,
  Skeleton,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Archive, Check, MessagesSquare, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type {
  InboxMessage,
  InboxMessageStatus,
  InboxThreadListItem,
} from "../api.js";
import { ThreadDetail } from "../components/thread-detail.js";
import {
  useInboxListAgentUiSlice,
  useInboxThreadAgentUiSlice,
} from "../hooks/use-inbox-agent-ui-slice.js";
import { useInboxSecondaryNav } from "../hooks/use-inbox-secondary-nav.js";
import { formatInboxRelativeTime } from "../lib/format-relative-time.js";
import {
  INBOX_STATUS_BADGE_VARIANT,
  isInboxStatusUnhandled,
} from "../lib/inbox-status-badge.js";
import {
  useInboxSearchQuery,
  useInboxThreadQuery,
  useInboxThreadsQuery,
  useRunSyncNowMutation,
  useSetMessageStatusMutation,
} from "../queries.js";

const PAGE_SIZE = 50;
const LIST_PANE_WIDTH_KEY = "engenty.inbox.list_pane.width_px";
const LIST_PANE_DEFAULT_WIDTH = 380;
const LIST_PANE_MIN_WIDTH = 280;
const LIST_PANE_MAX_WIDTH = 560;

const INBOX_LANES = ["all", "new", "triaged", "processed", "archived"] as const;

const INBOX_SET_LIST_FILTER_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description:
    "Set the inbox list page filters in the browser only (lane, account connection id, search text). Does not persist — refreshes or navigation away reset search; lane/account live in the URL query string for this session.",
  parameters: {
    additionalProperties: false,
    properties: {
      account: {
        description:
          "Connection id to filter by, or empty string to clear the account filter.",
        type: "string",
      },
      lane: {
        description: "Triage lane: all | new | triaged | processed | archived.",
        type: "string",
      },
      search: {
        description: "Client-side search box text (not persisted).",
        type: "string",
      },
    },
    type: "object",
  },
  name: "inbox_set_list_filter",
  owner_module_id: "inbox",
  title: "Set Inbox List Filter",
});

const INBOX_OPEN_THREAD_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description:
    "Navigate the inbox UI to a thread detail view (`/mdl/inbox/:threadId`). Use after inbox_get_thread or search to show the user what you found.",
  parameters: {
    additionalProperties: false,
    properties: {
      thread_id: { type: "string" },
    },
    required: ["thread_id"],
    type: "object",
  },
  name: "inbox_open_thread",
  owner_module_id: "inbox",
  title: "Open Inbox Thread",
});

export function InboxClientPage() {
  const { t } = useTranslation("inbox");
  const navigate = useNavigate();
  const { setCopilotContext } = useCopilotShell();
  const { threadId } = useParams<{ threadId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const lane = searchParams.get("lane") ?? "all";
  const account = searchParams.get("account");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useInboxSecondaryNav();
  const threadQuery = useInboxThreadQuery(threadId ?? null);
  const setStatus = useSetMessageStatusMutation();
  const threadDetail = threadQuery.data;
  const threadSubject =
    threadDetail?.thread.subject ?? (threadId ? t("list.noSubject") : null);
  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t(`lanes.${lane}`) },
      ...(threadId && threadSubject ? [{ label: threadSubject }] : []),
    ],
    [moduleRootCrumb, t, lane, threadId, threadSubject]
  );
  const pageActions = useMemo(() => {
    if (!(threadId && threadDetail)) {
      return null;
    }

    const applyStatus = (
      messages: InboxMessage[],
      status: InboxMessageStatus
    ) =>
      setStatus.mutate(
        { ids: messages.map((message) => message.id), status },
        {
          onError: (error) =>
            toast.error(t("toasts.statusFailed", { error: String(error) })),
          onSuccess: () => toast.success(t(`toasts.status.${status}`)),
        }
      );

    return (
      <div className="flex items-center gap-2">
        <Button
          disabled={setStatus.isPending}
          onClick={() => applyStatus(threadDetail.messages, "processed")}
          size="sm"
          variant="outline"
        >
          <Check className="size-4" /> {t("actions.markProcessed")}
        </Button>
        <Button
          disabled={setStatus.isPending}
          onClick={() => applyStatus(threadDetail.messages, "archived")}
          size="sm"
          variant="outline"
        >
          <Archive className="size-4" /> {t("actions.archive")}
        </Button>
      </div>
    );
  }, [threadId, threadDetail, setStatus, t]);
  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const threadsQuery = useInboxThreadsQuery({
    limit: PAGE_SIZE,
    offset,
    ...(account ? { connection_id: account } : {}),
    ...(lane === "all" ? {} : { status: lane as InboxMessageStatus }),
  });
  const searching = search.trim().length > 1;
  const searchQuery = useInboxSearchQuery(search);
  const syncNow = useRunSyncNowMutation();

  const openThread = useCallback(
    (id: string) => {
      const qs = searchParams.toString();
      navigate(`/mdl/inbox/${id}${qs ? `?${qs}` : ""}`);
    },
    [navigate, searchParams]
  );

  useEngentyFrontendTool(
    INBOX_SET_LIST_FILTER_TOOL,
    useCallback(
      (input) => {
        const record =
          input && typeof input === "object" && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : {};

        if ("lane" in record) {
          if (typeof record.lane !== "string") {
            throw new Error("lane must be a string when provided.");
          }
          if (!(INBOX_LANES as readonly string[]).includes(record.lane)) {
            throw new Error(`lane must be one of: ${INBOX_LANES.join(", ")}.`);
          }
        }
        if ("account" in record && typeof record.account !== "string") {
          throw new Error("account must be a string when provided.");
        }
        if ("search" in record && typeof record.search !== "string") {
          throw new Error("search must be a string when provided.");
        }

        const nextLane = typeof record.lane === "string" ? record.lane : lane;
        const nextAccount =
          typeof record.account === "string"
            ? record.account.trim() || null
            : account;

        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (nextLane === "all") {
              next.delete("lane");
            } else {
              next.set("lane", nextLane);
            }
            if (nextAccount) {
              next.set("account", nextAccount);
            } else if ("account" in record) {
              next.delete("account");
            }
            return next;
          },
          { replace: true }
        );

        if (typeof record.search === "string") {
          setSearch(record.search);
        }
        setOffset(0);
        return {
          account: nextAccount,
          lane: nextLane,
          ok: true,
          search: typeof record.search === "string" ? record.search : search,
        };
      },
      [account, lane, search, setSearchParams]
    )
  );

  useEngentyFrontendTool(
    INBOX_OPEN_THREAD_TOOL,
    useCallback(
      (input) => {
        const record =
          input && typeof input === "object" && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : {};
        const id =
          typeof record.thread_id === "string" ? record.thread_id.trim() : "";
        if (!id) {
          throw new Error("thread_id is required.");
        }
        openThread(id);
        return { ok: true, thread_id: id };
      },
      [openThread]
    )
  );

  const threads = threadsQuery.data?.threads ?? [];
  const total = threadsQuery.data?.total ?? 0;
  const laneFiltered = lane !== "all" || Boolean(account);

  useInboxListAgentUiSlice({
    account,
    lane,
    search,
    threads,
    total,
  });
  useInboxThreadAgentUiSlice({
    detail: threadDetail,
    threadId: threadId ?? null,
  });

  useEffect(() => {
    if (threadId) {
      setCopilotContext({
        moduleId: "inbox",
        routeKey: "thread",
        scope: {
          currentModule: "inbox",
          entityType: "inbox_thread",
          entityId: threadId,
          lane,
          ...(account ? { account } : {}),
        },
      });
    } else {
      setCopilotContext({
        moduleId: "inbox",
        routeKey: "list",
        scope: {
          currentModule: "inbox",
          entityType: "inbox_thread",
          lane,
          ...(account ? { account } : {}),
        },
      });
    }
    return () => setCopilotContext(null);
  }, [account, lane, setCopilotContext, threadId]);

  const {
    displayedWidthPx,
    handleResizeKeyDown,
    handleResizePointerDown,
    isResizing,
  } = usePersistedEwResizePaneWidth({
    defaultPx: LIST_PANE_DEFAULT_WIDTH,
    maxPx: LIST_PANE_MAX_WIDTH,
    minPx: LIST_PANE_MIN_WIDTH,
    storageKey: LIST_PANE_WIDTH_KEY,
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden">
      {/* List pane — hidden on mobile when a thread is open */}
      <div
        className={cn(
          "flex h-full min-h-0 flex-col md:w-[var(--inbox-list-width)] md:max-w-[50vw] md:shrink-0",
          threadId ? "hidden md:flex" : "flex w-full"
        )}
        data-engenty-region="list"
        style={
          {
            "--inbox-list-width": `${displayedWidthPx}px`,
          } as React.CSSProperties
        }
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <Input
            className="h-8"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            value={search}
          />
          <Button
            disabled={syncNow.isPending}
            onClick={() =>
              syncNow.mutate(
                {},
                {
                  onError: (error) =>
                    toast.error(
                      t("toasts.syncFailed", { error: String(error) })
                    ),
                  onSuccess: (result) => {
                    const synced = result.connections.reduce(
                      (sum, entry) => sum + entry.new_messages,
                      0
                    );
                    toast.success(t("toasts.syncDone", { count: synced }));
                  },
                }
              )
            }
            size="icon-sm"
            title={t("actions.syncNow")}
            variant="ghost"
          >
            <RefreshCw
              className={syncNow.isPending ? "size-4 animate-spin" : "size-4"}
            />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {searching ? (
            <SearchResultList onOpenThread={openThread} query={searchQuery} />
          ) : threadsQuery.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : threadsQuery.isError ? (
            <div className="p-3">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t("errors.loadFailed")}</EmptyTitle>
                  <EmptyDescription>
                    {String(threadsQuery.error)}
                  </EmptyDescription>
                </EmptyHeader>
                <Button
                  onClick={() => threadsQuery.refetch()}
                  size="sm"
                  variant="outline"
                >
                  {t("errors.retry")}
                </Button>
              </Empty>
            </div>
          ) : threads.length === 0 ? (
            <div className="p-3">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>
                    {laneFiltered ? t("empty.laneTitle") : t("empty.title")}
                  </EmptyTitle>
                  <EmptyDescription>
                    {laneFiltered
                      ? t("empty.laneDescription")
                      : t("empty.description")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <div>
              {threads.map((thread) => (
                <ThreadRow
                  active={thread.id === threadId}
                  key={thread.id}
                  onOpen={() => openThread(thread.id)}
                  thread={thread}
                />
              ))}
              {total > PAGE_SIZE ? (
                <div className="flex items-center justify-between border-t p-2">
                  <Button
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    size="sm"
                    variant="ghost"
                  >
                    {t("list.previous")}
                  </Button>
                  <span className="text-muted-foreground text-xs">
                    {t("list.pageInfo", {
                      from: offset + 1,
                      to: offset + threads.length,
                      total,
                    })}
                  </span>
                  <Button
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                    size="sm"
                    variant="ghost"
                  >
                    {t("list.next")}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="hidden h-full shrink-0 md:block">
        <PaneResizeHandle
          isResizing={isResizing}
          label={t("list.resizeListPane")}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={handleResizePointerDown}
        />
      </div>

      {/* Detail pane — full-screen on mobile when a thread is open */}
      <div
        className={cn(
          "h-full min-h-0 min-w-0 flex-1",
          threadId ? "flex flex-col" : "hidden md:flex md:flex-col"
        )}
        data-engenty-region="detail"
      >
        {threadId ? (
          <div className="border-b px-3 py-2 md:hidden">
            <Button
              onClick={() => {
                const qs = searchParams.toString();
                navigate(`/mdl/inbox${qs ? `?${qs}` : ""}`);
              }}
              size="sm"
              variant="ghost"
            >
              ← {t("title")}
            </Button>
          </div>
        ) : null}
        <ThreadDetail threadId={threadId ?? null} />
      </div>
    </div>
  );
}

function ThreadRow({
  active,
  onOpen,
  thread,
}: {
  active: boolean;
  onOpen: () => void;
  thread: InboxThreadListItem;
}) {
  const { t, i18n } = useTranslation("inbox");
  const unhandled = isInboxStatusUnhandled(thread.latest_status);

  return (
    <button
      className={cn(
        "block w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-accent",
        active && "bg-accent"
      )}
      onClick={onOpen}
      type="button"
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm",
              unhandled ? "font-semibold" : "font-medium"
            )}
          >
            {thread.latest_from_name ??
              thread.latest_from_email ??
              thread.participants[0] ??
              "—"}
          </span>
          <span className="block truncate text-sm">
            {thread.subject ?? t("list.noSubject")}
          </span>
          {thread.latest_snippet ? (
            <p className="truncate text-muted-foreground text-xs">
              {thread.latest_snippet}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-muted-foreground text-xs">
            {formatInboxRelativeTime(thread.last_message_at, i18n.language)}
          </span>
          <div className="flex items-center gap-1.5">
            {thread.message_count > 1 ? (
              <span
                className="inline-flex items-center gap-0.5 text-primary text-xs"
                title={t("list.messageCountTitle", {
                  count: thread.message_count,
                })}
              >
                <MessagesSquare className="size-3.5" />
                {thread.message_count}
              </span>
            ) : null}
            {thread.latest_status ? (
              <Badge
                className="px-1.5 py-0 text-[10px]"
                variant={INBOX_STATUS_BADGE_VARIANT[thread.latest_status]}
              >
                {t(`lanes.${thread.latest_status}`)}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function SearchResultList({
  onOpenThread,
  query,
}: {
  onOpenThread: (threadId: string) => void;
  query: ReturnType<typeof useInboxSearchQuery>;
}) {
  const { t, i18n } = useTranslation("inbox");
  if (query.isLoading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="p-3">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("errors.loadFailed")}</EmptyTitle>
            <EmptyDescription>{String(query.error)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  const results = query.data?.results ?? [];
  if (results.length === 0) {
    return (
      <div className="p-3">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("search.noResults")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  return (
    <div>
      {results.map(({ item }) => (
        <button
          className="block w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-accent"
          key={item.message.id}
          onClick={() => onOpenThread(item.message.thread_id)}
          type="button"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium text-sm">
              {item.message.from_name ?? item.message.from_email ?? "—"}
            </span>
            <span className="shrink-0 text-muted-foreground text-xs">
              {formatInboxRelativeTime(item.message.received_at, i18n.language)}
            </span>
          </div>
          <span className="truncate text-sm">
            {item.message.subject ?? t("list.noSubject")}
          </span>
          {item.message.snippet ? (
            <p className="truncate text-muted-foreground text-xs">
              {item.message.snippet}
            </p>
          ) : null}
        </button>
      ))}
    </div>
  );
}
