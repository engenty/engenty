// The mail client: master-detail over the synced local store. Lanes and the
// account filter live in the shell secondary nav (see InboxSidebarPanel) and
// travel as `?lane=` / `?account=` search params; the selected thread is the
// `/mdl/inbox/:threadId` route param so it deep-links.
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
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { InboxMessageStatus, InboxThreadListItem } from "../api.js";
import { ThreadDetail } from "../components/thread-detail.js";
import { useInboxSecondaryNav } from "../hooks/use-inbox-secondary-nav.js";
import {
  useInboxSearchQuery,
  useInboxThreadsQuery,
  useRunSyncNowMutation,
} from "../queries.js";

const PAGE_SIZE = 50;

export function InboxClientPage() {
  const { t } = useTranslation("inbox");
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId?: string }>();
  const [searchParams] = useSearchParams();
  const lane = searchParams.get("lane") ?? "all";
  const account = searchParams.get("account");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useInboxSecondaryNav();
  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t(`lanes.${lane}`) },
    ],
    [moduleRootCrumb, t, lane]
  );
  usePageConfig({
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

  const openThread = (id: string) => {
    const qs = searchParams.toString();
    navigate(`/mdl/inbox/${id}${qs ? `?${qs}` : ""}`);
  };

  const threads = threadsQuery.data?.threads ?? [];
  const total = threadsQuery.data?.total ?? 0;
  const laneFiltered = lane !== "all" || Boolean(account);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden">
      {/* List pane — hidden on mobile when a thread is open */}
      <div
        className={cn(
          "flex h-full min-h-0 w-full flex-col border-r md:w-[380px] md:min-w-[340px] md:shrink-0",
          threadId ? "hidden md:flex" : "flex"
        )}
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

      {/* Detail pane — full-screen on mobile when a thread is open */}
      <div
        className={cn(
          "h-full min-h-0 min-w-0 flex-1",
          threadId ? "flex flex-col" : "hidden md:flex md:flex-col"
        )}
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
  const { t } = useTranslation("inbox");
  return (
    <button
      className={cn(
        "block w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-accent",
        active && "bg-accent"
      )}
      onClick={onOpen}
      type="button"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "truncate text-sm",
            thread.unhandled_count > 0 ? "font-semibold" : "font-medium"
          )}
        >
          {thread.latest_from_name ??
            thread.latest_from_email ??
            thread.participants[0] ??
            "—"}
        </span>
        <span className="shrink-0 text-muted-foreground text-xs">
          {thread.last_message_at
            ? new Date(thread.last_message_at).toLocaleDateString()
            : ""}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm">
          {thread.subject ?? t("list.noSubject")}
        </span>
        {thread.message_count > 1 ? (
          <Badge variant="secondary">{thread.message_count}</Badge>
        ) : null}
        {thread.unhandled_count > 0 ? (
          <Badge>{thread.unhandled_count}</Badge>
        ) : null}
      </div>
      {thread.latest_snippet ? (
        <p className="truncate text-muted-foreground text-xs">
          {thread.latest_snippet}
        </p>
      ) : null}
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
  const { t } = useTranslation("inbox");
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
              {item.message.received_at
                ? new Date(item.message.received_at).toLocaleDateString()
                : ""}
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
