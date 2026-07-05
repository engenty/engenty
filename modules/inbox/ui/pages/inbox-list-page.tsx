import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { Mail, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { InboxAccount, InboxMessageStatus } from "../api.js";
import {
  useInboxAccountsQuery,
  useInboxSearchQuery,
  useInboxThreadsQuery,
  useRunSyncNowMutation,
} from "../queries.js";

const PAGE_SIZE = 25;
const STATUS_LANES = [
  "all",
  "new",
  "triaged",
  "processed",
  "archived",
] as const;

function accountLabel(account: InboxAccount): string {
  return (
    account.display_name ?? account.external_account ?? account.connector_id
  );
}

export function InboxListPage() {
  const { t } = useTranslation("inbox");
  const navigate = useNavigate();
  const [lane, setLane] = useState<(typeof STATUS_LANES)[number]>("all");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");

  const accountsQuery = useInboxAccountsQuery();
  const threadsQuery = useInboxThreadsQuery({
    limit: PAGE_SIZE,
    offset,
    ...(connectionId ? { connection_id: connectionId } : {}),
    ...(lane === "all" ? {} : { status: lane as InboxMessageStatus }),
  });
  const searchQuery = useInboxSearchQuery(search);
  const syncNow = useRunSyncNowMutation();

  const accounts = accountsQuery.data?.accounts ?? [];
  const searching = search.trim().length > 1;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 font-semibold text-xl">
          <Mail className="size-5" /> {t("title")}
        </h1>
        <div className="flex items-center gap-2">
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
            size="sm"
            variant="outline"
          >
            <RefreshCw
              className={syncNow.isPending ? "size-4 animate-spin" : "size-4"}
            />
            {t("actions.syncNow")}
          </Button>
          <Button
            onClick={() => navigate("/mdl/inbox/settings")}
            size="sm"
            variant="ghost"
          >
            {t("actions.settings")}
          </Button>
        </div>
      </div>

      {/* Account filter chips */}
      {accounts.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setConnectionId(null);
              setOffset(0);
            }}
            size="sm"
            variant={connectionId === null ? "default" : "outline"}
          >
            {t("filters.allAccounts")}
          </Button>
          {accounts.map((account) => (
            <Button
              key={account.connection_id}
              onClick={() => {
                setConnectionId(account.connection_id);
                setOffset(0);
              }}
              size="sm"
              variant={
                connectionId === account.connection_id ? "default" : "outline"
              }
            >
              {accountLabel(account)}
              {account.sharing === "org" ? (
                <Badge className="ml-1" variant="secondary">
                  {t("filters.org")}
                </Badge>
              ) : null}
            </Button>
          ))}
        </div>
      ) : null}

      <Input
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("filters.searchPlaceholder")}
        value={search}
      />

      {searching ? (
        <SearchResults
          isLoading={searchQuery.isLoading}
          onOpenThread={(threadId) => navigate(`/mdl/inbox/${threadId}`)}
          results={searchQuery.data?.results ?? []}
        />
      ) : (
        <>
          <Tabs
            onValueChange={(value) => {
              setLane(value as (typeof STATUS_LANES)[number]);
              setOffset(0);
            }}
            value={lane}
          >
            <TabsList>
              {STATUS_LANES.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {t(`lanes.${value}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {threadsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (threadsQuery.data?.threads.length ?? 0) === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t("empty.title")}</EmptyTitle>
                <EmptyDescription>{t("empty.description")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-2">
              {threadsQuery.data?.threads.map((thread) => (
                <Card
                  className="cursor-pointer p-3 transition-colors hover:bg-accent"
                  key={thread.id}
                  onClick={() => navigate(`/mdl/inbox/${thread.id}`)}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-sm">
                      {thread.latest_from_name ??
                        thread.latest_from_email ??
                        thread.participants[0] ??
                        "—"}
                    </span>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {thread.last_message_at
                        ? new Date(thread.last_message_at).toLocaleString()
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
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
                </Card>
              ))}
              <div className="flex items-center justify-between pt-2">
                <Button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  size="sm"
                  variant="outline"
                >
                  {t("list.previous")}
                </Button>
                <span className="text-muted-foreground text-xs">
                  {t("list.pageInfo", {
                    from: offset + 1,
                    to: offset + (threadsQuery.data?.threads.length ?? 0),
                    total: threadsQuery.data?.total ?? 0,
                  })}
                </span>
                <Button
                  disabled={
                    offset + PAGE_SIZE >= (threadsQuery.data?.total ?? 0)
                  }
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  size="sm"
                  variant="outline"
                >
                  {t("list.next")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SearchResults({
  isLoading,
  onOpenThread,
  results,
}: {
  isLoading: boolean;
  onOpenThread: (threadId: string) => void;
  results: {
    item: {
      message: {
        from_email: string | null;
        from_name: string | null;
        id: string;
        received_at: string | null;
        snippet: string | null;
        subject: string | null;
        thread_id: string;
      };
    };
  }[];
}) {
  const { t } = useTranslation("inbox");
  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (results.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t("search.noResults")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="space-y-2">
      {results.map(({ item }) => (
        <Card
          className="cursor-pointer p-3 transition-colors hover:bg-accent"
          key={item.message.id}
          onClick={() => onOpenThread(item.message.thread_id)}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium text-sm">
              {item.message.from_name ?? item.message.from_email ?? "—"}
            </span>
            <span className="shrink-0 text-muted-foreground text-xs">
              {item.message.received_at
                ? new Date(item.message.received_at).toLocaleString()
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
        </Card>
      ))}
    </div>
  );
}
