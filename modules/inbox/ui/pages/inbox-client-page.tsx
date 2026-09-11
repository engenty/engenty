// The mail client: master-detail over the synced local store. Lanes and the
// account filter live in the shell secondary nav (see InboxSidebarPanel) and
// travel as `?lane=` / `?account=` search params; the selected thread is the
// `/mdl/inbox/:threadId` route param so it deep-links.

import { useEngentyFrontendTool } from "@engenty/ai-ui";
import {
  COPILOT_BOTTOM_DOCK_CLEARANCE,
  createFrontendToolDefinition,
  PaneResizeHandle,
  useCopilotShell,
  usePersistedEwResizePaneWidth,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  DetailPageHeader,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  ScrollArea,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import {
  Archive,
  Mail,
  MailOpen,
  MessagesSquare,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  getCategoryTitleLabel,
  visibleInboxCategories,
} from "../api/inbox-categories-settings.js";
import type {
  InboxMessage,
  InboxMessageCategory,
  InboxMessageStatus,
  InboxThreadListItem,
} from "../api.js";
import { EmptyAccountsHint } from "../components/empty-accounts-hint.js";
import { ThreadDetail } from "../components/thread-detail.js";
import {
  useInboxListAgentUiSlice,
  useInboxThreadAgentUiSlice,
} from "../hooks/use-inbox-agent-ui-slice.js";
import { useInboxSecondaryNav } from "../hooks/use-inbox-secondary-nav.js";
import { formatInboxRelativeTime } from "../lib/format-relative-time.js";
import { isInboxStatusUnread } from "../lib/inbox-status-badge.js";
import {
  useClassifyPendingMutation,
  useInboxCategoriesQuery,
  useInboxSearchQuery,
  useInboxThreadQuery,
  useInboxThreadsQuery,
  useRunSyncNowMutation,
  useSetMessageStatusMutation,
} from "../queries.js";

const PAGE_SIZE = 50;
const LIST_PANE_WIDTH_KEY = "engenty.inbox.list_pane.width_px";
const LIST_PANE_COLLAPSED_KEY = "engenty.inbox.list_pane.collapsed";
const LIST_PANE_DEFAULT_WIDTH = 380;
const LIST_PANE_MIN_WIDTH = 280;
const LIST_PANE_MAX_WIDTH = 560;

const INBOX_LANES = ["all", "new", "read", "archived"] as const;

function readStoredListCollapsed(): boolean {
  try {
    return window.localStorage.getItem(LIST_PANE_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

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
        description: "Mailbox lane: all | new | read | archived.",
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
  const { dockMode, open: copilotOpen, setCopilotContext } = useCopilotShell();
  // The shell keeps the bottom dock clear of content by padding the main
  // column, which leaves a strip of empty page below both panes. The dock now
  // sits over the thread pane only (see `--copilot-dock-inset-left`), so the
  // list has no reason to stop short: the split grows into that strip and the
  // thread pane alone pads itself back out, keeping its pinned zone clear.
  const dockInset =
    copilotOpen && dockMode === "bottom"
      ? COPILOT_BOTTOM_DOCK_CLEARANCE
      : "0px";
  const { threadId } = useParams<{ threadId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const lane = searchParams.get("lane") ?? "all";
  const account = searchParams.get("account");
  const category = searchParams.get("category") as InboxMessageCategory | null;
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const categoriesQuery = useInboxCategoriesQuery();
  const visibleCategories = useMemo(
    () =>
      categoriesQuery.data ? visibleInboxCategories(categoriesQuery.data) : [],
    [categoriesQuery.data]
  );

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useInboxSecondaryNav();
  const threadDetail = useInboxThreadQuery(threadId ?? null).data;
  const setStatus = useSetMessageStatusMutation();
  const threadSubject =
    threadDetail?.thread.subject ?? (threadId ? t("list.noSubject") : null);
  // Every segment except the current thread navigates: the lane and category
  // crumbs drop back to the list they name, keeping the account filter.
  const breadcrumbs = useMemo(() => {
    const listHref = (params: URLSearchParams) => {
      const qs = params.toString();
      return `/mdl/inbox${qs ? `?${qs}` : ""}`;
    };
    const laneParams = new URLSearchParams(searchParams);
    laneParams.delete("category");

    return [
      // Omitted while the module nav is pinned — the sidebar header says it.
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      // The inbox lane IS the module's home, so it earns no crumb of its own:
      // the module crumb already says "Posteingang", and pinned open the column
      // header does. Only the other lanes add a segment.
      ...(lane === "all"
        ? []
        : [{ label: t(`lanes.${lane}`), to: listHref(laneParams) }]),
      ...(category
        ? [
            {
              label: getCategoryTitleLabel(
                category,
                categoriesQuery.data?.items.find(
                  (item) => item.slug === category
                )?.title,
                t
              ),
              to: listHref(new URLSearchParams(searchParams)),
            },
          ]
        : []),
      ...(threadId && threadSubject ? [{ label: threadSubject }] : []),
    ];
  }, [
    categoriesQuery.data,
    category,
    lane,
    moduleRootCrumb,
    searchParams,
    t,
    threadId,
    threadSubject,
  ]);
  // The thread's actions belong in the shell topbar, as on every other screen.
  // Their presence is also what keeps the topbar from collapsing itself when
  // the module nav is pinned — see `suppressEmptyTopbar` in AppTopbar.
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

    const latestStatus =
      threadDetail.messages.at(-1)?.status ??
      threadDetail.messages[0]?.status ??
      "new";
    const markRead = latestStatus === "new";

    return (
      <div className="flex items-center gap-2">
        <Button
          disabled={setStatus.isPending}
          onClick={() =>
            applyStatus(threadDetail.messages, markRead ? "read" : "new")
          }
          size="sm"
          variant="outline"
        >
          {markRead ? (
            <>
              <MailOpen className="size-4" /> {t("actions.markRead")}
            </>
          ) : (
            <>
              <Mail className="size-4" /> {t("actions.markUnread")}
            </>
          )}
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
  });

  const threadsQuery = useInboxThreadsQuery({
    limit: PAGE_SIZE,
    offset,
    ...(account ? { connection_id: account } : {}),
    ...(category ? { category } : {}),
    ...(lane === "all" ? {} : { status: lane as InboxMessageStatus }),
  });
  const searching = search.trim().length > 1;
  const searchQuery = useInboxSearchQuery(search);
  const syncNow = useRunSyncNowMutation();
  const classify = useClassifyPendingMutation();

  /**
   * Categories are what the category lanes filter on, and they only exist once
   * a message has been classified. Sync is the moment new mail appears, so it
   * is also the moment to classify — in batches, until nothing is pending.
   */
  const classifyPending = useCallback(() => {
    const runBatch = () => {
      classify.mutate(
        {},
        {
          onSuccess: (result) => {
            if (result.remaining > 0) {
              runBatch();
            }
          },
        }
      );
    };
    runBatch();
  }, [classify]);

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
  const laneFiltered = lane !== "all" || Boolean(account) || Boolean(category);

  // Prev/next walks whatever the list pane is showing — the lane page, or the
  // search hits when searching. Stepping off either end of a lane page pulls
  // the neighbouring page and lands on the message next to the boundary.
  const orderedIds = useMemo(() => {
    if (!searching) {
      return threads.map((thread) => thread.id);
    }
    const ids: string[] = [];
    for (const { item } of searchQuery.data?.results ?? []) {
      if (!ids.includes(item.message.thread_id)) {
        ids.push(item.message.thread_id);
      }
    }
    return ids;
  }, [searching, searchQuery.data, threads]);
  const currentIndex = threadId ? orderedIds.indexOf(threadId) : -1;
  const canPageBack = !searching && offset > 0;
  const canPageForward = !searching && offset + threads.length < total;
  const [pendingSelect, setPendingSelect] = useState<"first" | "last" | null>(
    null
  );

  const stepThread = useCallback(
    (direction: -1 | 1) => {
      const target = orderedIds[currentIndex + direction];
      if (target) {
        openThread(target);
        return;
      }
      if (searching) {
        return;
      }
      if (direction === -1 && offset > 0) {
        setOffset(Math.max(0, offset - PAGE_SIZE));
        setPendingSelect("last");
      } else if (direction === 1) {
        setOffset(offset + PAGE_SIZE);
        setPendingSelect("first");
      }
    },
    [currentIndex, offset, openThread, orderedIds, searching]
  );

  useEffect(() => {
    if (!pendingSelect || threadsQuery.isFetching) {
      return;
    }
    const target = pendingSelect === "first" ? threads.at(0) : threads.at(-1);
    setPendingSelect(null);
    if (target) {
      openThread(target.id);
    }
  }, [openThread, pendingSelect, threads, threadsQuery.isFetching]);

  const [listCollapsed, setListCollapsed] = useState(readStoredListCollapsed);
  const toggleList = useCallback(() => {
    setListCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        window.localStorage.setItem(LIST_PANE_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Storage unavailable — the toggle still works for this session.
      }
      return next;
    });
  }, []);
  // Hiding the list with nothing open would leave an empty screen.
  const listHidden = listCollapsed && Boolean(threadId);

  const closeThread = useCallback(() => {
    const qs = searchParams.toString();
    navigate(`/mdl/inbox${qs ? `?${qs}` : ""}`);
  }, [navigate, searchParams]);

  const threadNav = useMemo(
    () => ({
      canNext:
        currentIndex >= 0 &&
        (currentIndex < orderedIds.length - 1 || canPageForward),
      canPrevious: currentIndex > 0 || (currentIndex === 0 && canPageBack),
      listCollapsed,
      onBack: closeThread,
      onNext: () => stepThread(1),
      onPrevious: () => stepThread(-1),
      onToggleList: toggleList,
      position:
        currentIndex < 0
          ? null
          : searching
            ? `${currentIndex + 1} / ${orderedIds.length}`
            : `${offset + currentIndex + 1} / ${total}`,
    }),
    [
      canPageBack,
      canPageForward,
      closeThread,
      currentIndex,
      listCollapsed,
      offset,
      orderedIds.length,
      searching,
      stepThread,
      toggleList,
      total,
    ]
  );

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

  // The copilot dock is portaled into the shell's main content and centres on
  // it, which would put it astride the split. Excluding the list pane's width
  // centres it on the thread being read. Set on the root because the dock is
  // mounted outside this tree; the shell only reads it above `md`.
  useEffect(() => {
    const paneShowing = Boolean(threadId) && !listCollapsed;
    const root = document.documentElement;
    root.style.setProperty(
      "--copilot-dock-inset-left",
      paneShowing ? `${displayedWidthPx}px` : "0px"
    );
    return () => {
      root.style.removeProperty("--copilot-dock-inset-left");
    };
  }, [displayedWidthPx, listCollapsed, threadId]);

  // One body, two densities: narrow rows beside an open thread, full-width rows
  // when the list is the page.
  const renderListBody = (wide: boolean) => {
    if (searching) {
      return <SearchResultList onOpenThread={openThread} query={searchQuery} />;
    }
    if (threadsQuery.isLoading) {
      return (
        <div className="space-y-2 p-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      );
    }
    if (threadsQuery.isError) {
      return (
        <div className="p-3">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("errors.loadFailed")}</EmptyTitle>
              <EmptyDescription>{String(threadsQuery.error)}</EmptyDescription>
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
      );
    }
    if (threads.length === 0) {
      return (
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
            {/* A category lane is empty until messages are classified —
                offer the batch run instead of leaving a dead end. */}
            {category ? (
              <Button
                disabled={classify.isPending}
                onClick={classifyPending}
                size="sm"
                variant="outline"
              >
                {classify.isPending
                  ? t("actions.classifying")
                  : t("actions.classifyNow")}
              </Button>
            ) : null}
            {/* The unfiltered inbox being empty usually has a nameable cause:
                no account, or every account's autonomy is off (no sync). */}
            {laneFiltered ? null : <EmptyAccountsHint />}
          </Empty>
        </div>
      );
    }
    return (
      <div>
        {threads.map((thread) =>
          wide ? (
            <ThreadListRow
              key={thread.id}
              onOpen={() => openThread(thread.id)}
              thread={thread}
            />
          ) : (
            <ThreadRow
              active={thread.id === threadId}
              key={thread.id}
              onOpen={() => openThread(thread.id)}
              thread={thread}
            />
          )
        )}
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
    );
  };

  const searchAndSync = (
    <div className="flex items-center gap-2">
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
                toast.error(t("toasts.syncFailed", { error: String(error) })),
              onSuccess: (result) => {
                const synced = result.connections.reduce(
                  (sum, entry) => sum + entry.new_messages,
                  0
                );
                toast.success(t("toasts.syncDone", { count: synced }));
                classifyPending();
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
  );

  // With nothing open the list *is* the page: full width, on the same header as
  // every detail page, with the category tabs as its section tabs.
  if (!threadId) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col bg-card">
        <DetailPageHeader
          belowStrip={
            <div className="flex w-full items-end justify-between gap-3">
              {/* Categories, not lanes: what a message *is* barely changes,
                  so it reads as a section of the inbox. Mailbox lanes (inbox /
                  archived) stay in the sidebar next to the other filters. */}
              <Tabs
                onValueChange={(value) => {
                  setOffset(0);
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      if (value === "all") {
                        next.delete("category");
                      } else {
                        next.set("category", value);
                      }
                      return next;
                    },
                    { replace: true }
                  );
                }}
                value={category ?? "all"}
              >
                <TabsList
                  className="-mb-px h-auto w-fit border-0 bg-transparent p-0"
                  variant="line"
                >
                  <TabsTrigger value="all">{t("lanes.all")}</TabsTrigger>
                  {visibleCategories.map((item) => (
                    <TabsTrigger key={item.slug} value={item.slug}>
                      {getCategoryTitleLabel(item.slug, item.title, t)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="shrink-0 pb-1">{searchAndSync}</div>
            </div>
          }
          containerClassName="px-4 pt-3 pb-0 sm:px-4"
          maxWidth="8xl"
          title={t("title")}
        />
        <ScrollArea className="min-h-0 flex-1">
          {renderListBody(true)}
        </ScrollArea>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 w-full flex-row overflow-hidden"
      style={{ height: `calc(100% + ${dockInset})` }}
    >
      {/* List pane — hidden on mobile when a thread is open */}
      <div
        className={cn(
          // bg-card on the pane, not the rows, so the surface runs the full
          // height even where the list is short or still loading.
          "flex h-full min-h-0 flex-col bg-card md:w-[var(--inbox-list-width)] md:max-w-[50vw] md:shrink-0",
          threadId ? "hidden md:flex" : "flex w-full",
          listHidden && "md:hidden"
        )}
        data-engenty-region="list"
        style={
          {
            "--inbox-list-width": `${displayedWidthPx}px`,
          } as React.CSSProperties
        }
      >
        {/* h-11 keeps the pane's toolbar level with the thread header's top. */}
        <div className="flex h-11 shrink-0 items-center border-b bg-card px-3">
          {searchAndSync}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {renderListBody(false)}
        </ScrollArea>
      </div>

      <div className={cn("hidden h-full shrink-0", !listHidden && "md:block")}>
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
        // Hands back the space the split just took, so the thread's pinned
        // assistant zone stays above the dock hovering over this pane.
        style={{ paddingBottom: dockInset }}
      >
        {/* Mobile has no list pane to toggle — the thread is the whole screen,
            so it gets an explicit way back instead of the tab strip's toggle. */}
        {threadId ? (
          <div className="border-b bg-card px-3 py-2 md:hidden">
            <Button onClick={closeThread} size="sm" variant="ghost">
              ← {t("title")}
            </Button>
          </div>
        ) : null}
        <ThreadDetail nav={threadNav} threadId={threadId ?? null} />
      </div>
    </div>
  );
}

/**
 * The row for the full-width list: sender, subject with its snippet trailing on
 * one line, then time. Unread threads use semibold sender and subject. Below
 * `md` it folds into the same stacked shape as the narrow pane row — one grid,
 * placed explicitly at `md` because the reading order there differs from the
 * source order.
 */
function ThreadListRow({
  onOpen,
  thread,
}: {
  onOpen: () => void;
  thread: InboxThreadListItem;
}) {
  const { t, i18n } = useTranslation("inbox");
  const unhandled = isInboxStatusUnread(thread.latest_status);

  return (
    <button
      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b px-5 py-2.5 text-left transition-colors hover:bg-accent md:grid-cols-[minmax(0,190px)_minmax(0,1fr)_auto_auto]"
      onClick={onOpen}
      type="button"
    >
      <span
        className={cn(
          "truncate text-sm md:col-start-1 md:row-start-1",
          unhandled ? "font-semibold" : "font-medium"
        )}
      >
        {thread.latest_from_name ??
          thread.latest_from_email ??
          thread.participants[0] ??
          "—"}
      </span>
      <span className="justify-self-end whitespace-nowrap text-muted-foreground text-xs md:col-start-4 md:row-start-1">
        {formatInboxRelativeTime(thread.last_message_at, i18n.language)}
      </span>
      <span
        className={cn(
          "col-span-2 min-w-0 truncate text-sm md:col-span-1 md:col-start-2 md:row-start-1",
          unhandled ? "font-semibold" : "font-normal"
        )}
      >
        {thread.subject ?? t("list.noSubject")}
        {thread.latest_snippet ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            — {thread.latest_snippet}
          </span>
        ) : null}
      </span>
      {thread.message_count > 1 ? (
        <span className="col-span-2 flex items-center gap-1.5 md:col-span-1 md:col-start-3 md:row-start-1 md:justify-self-end">
          <span
            className="inline-flex items-center gap-0.5 text-primary text-xs"
            title={t("list.messageCountTitle", { count: thread.message_count })}
          >
            <MessagesSquare className="size-3.5" />
            {thread.message_count}
          </span>
        </span>
      ) : null}
    </button>
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
  const unhandled = isInboxStatusUnread(thread.latest_status);

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
          <span
            className={cn(
              "block truncate text-sm",
              unhandled ? "font-semibold" : "font-normal"
            )}
          >
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
