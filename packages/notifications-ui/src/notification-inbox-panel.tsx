// The compact inbox: lane tabs, the list, and a footer out to the full page.
// Shared by the rail bell and the space dashboard bell.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  cn,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  isUnseen,
  matchesLaneFilter,
  type NotificationLaneFilter,
} from "./classification.js";
import { NotificationList } from "./notification-list.js";
import { NOTIFICATIONS_PATH, spaceInboxPath } from "./notification-paths.js";
import { useMarkAllSeenMutation, useNotificationsQuery } from "./queries.js";

/** Width + padding for the popover chrome. Height is fixed so lane switches never resize it. */
export const notificationInboxPopoverClassName =
  "z-[100] flex h-[min(40rem,calc(100vh-1.5rem))] min-h-[min(40rem,calc(100vh-1.5rem))] w-[min(32rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0";

type InboxLane = Exclude<NotificationLaneFilter, "all">;

const INBOX_TABS: {
  value: InboxLane;
  labelKey: string;
  defaultLabel: string;
  titleKey: string;
  titleDefault: string;
  badgeVariant: "default" | "destructive" | "secondary";
}[] = [
  {
    badgeVariant: "default",
    defaultLabel: "Approvals",
    labelKey: "notifications.lane.approvals",
    titleDefault: "{{count}} open approvals",
    titleKey: "notifications.inboxTitle.hitl",
    value: "hitl",
  },
  {
    badgeVariant: "destructive",
    defaultLabel: "Errors",
    labelKey: "notifications.lane.errors",
    titleDefault: "{{count}} errors",
    titleKey: "notifications.inboxTitle.errors",
    value: "errors",
  },
  {
    badgeVariant: "secondary",
    defaultLabel: "Updates",
    labelKey: "notifications.lane.updates",
    titleDefault: "{{count}} updates",
    titleKey: "notifications.inboxTitle.updates",
    value: "updates",
  },
];

export interface NotificationInboxPanelProps {
  /** Standing in a space: the panel opens narrowed to it, with a way out. */
  inSpace: boolean;
  onNavigate: () => void;
  /**
   * When set, the list stays on that scope and the This space / All toggle
   * is hidden. The space dashboard bell is this space's inbox, not the
   * tenant aggregate.
   */
  scopeLocked?: "global" | "space";
  /** Overrides the "View all" destination. */
  viewAllHref?: string;
}

export function NotificationInboxPanel({
  inSpace,
  onNavigate,
  scopeLocked,
  viewAllHref,
}: NotificationInboxPanelProps) {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language || "en";
  const { spaceKey } = useParams<{ spaceKey?: string }>();
  const [scope, setScope] = useState<"space" | "global">(
    scopeLocked ?? (inSpace ? "space" : "global")
  );
  const [lane, setLane] = useState<InboxLane>("hitl");
  const listQuery = useNotificationsQuery({ limit: 50, scope });
  const markAll = useMarkAllSeenMutation();
  const notifications = listQuery.data?.notifications ?? [];
  const visible = notifications.filter((n) => matchesLaneFilter(n, lane));
  const hasUnseen = visible.some((n) => isUnseen(n));
  const showScopeToggle = inSpace && !scopeLocked;
  const href =
    viewAllHref ??
    (spaceKey && scope === "space"
      ? spaceInboxPath(spaceKey)
      : NOTIFICATIONS_PATH);
  const isEmpty =
    !(listQuery.isPending || listQuery.isError) && visible.length === 0;
  const activeTab =
    INBOX_TABS.find((tab) => tab.value === lane) ?? INBOX_TABS[0];

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-hidden [&_a]:no-underline"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) {
          onNavigate();
        }
      }}
    >
      <header className="flex shrink-0 items-end gap-2 border-border-soft border-b pt-2 pr-2 pl-1">
        <Tabs
          className="min-w-0 flex-1 gap-0"
          onValueChange={(value) => setLane(value as InboxLane)}
          value={lane}
        >
          <TabsList
            className="-mb-px h-9 justify-start rounded-none bg-transparent"
            variant="line"
          >
            {INBOX_TABS.map((tab) => {
              const count = notifications.filter((n) =>
                matchesLaneFilter(n, tab.value)
              ).length;
              return (
                <TabsTrigger
                  className="gap-1.5 px-3"
                  key={tab.value}
                  value={tab.value}
                >
                  {t(tab.labelKey, { defaultValue: tab.defaultLabel })}
                  {count > 0 ? (
                    <Badge
                      className="h-4 min-w-4 justify-center px-1 py-0 font-medium text-[10px] tabular-nums"
                      variant={tab.badgeVariant}
                    >
                      {count > 99 ? "99+" : count}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        {showScopeToggle ? (
          <span className="mb-1 inline-flex shrink-0 rounded-full bg-muted p-0.5 font-normal text-xs">
            {(["space", "global"] as const).map((value) => (
              <button
                aria-pressed={scope === value}
                className={cn(
                  "rounded-full px-2 py-0.5 transition-colors",
                  scope === value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={value}
                onClick={() => setScope(value)}
                type="button"
              >
                {value === "space"
                  ? t("notifications.scope.space", {
                      defaultValue: "Space",
                    })
                  : t("notifications.scope.all", { defaultValue: "All" })}
              </button>
            ))}
          </span>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-border-soft border-b bg-background px-4">
          <h2 className="min-w-0 truncate font-medium text-muted-foreground text-xs">
            {listQuery.isPending
              ? t("notifications.loading", { defaultValue: "Loading…" })
              : t(activeTab.titleKey, {
                  count: visible.length,
                  defaultValue: activeTab.titleDefault,
                })}
          </h2>
          {hasUnseen ? (
            <Button
              aria-label={t("notifications.markAllSeen", {
                defaultValue: "Mark all seen",
              })}
              className="size-6 shrink-0 text-muted-foreground"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
              size="icon-sm"
              title={t("notifications.markAllSeen", {
                defaultValue: "Mark all seen",
              })}
              variant="ghost"
            >
              <CheckCheck className="size-3.5" />
            </Button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {listQuery.isPending ? (
            <InboxSkeleton />
          ) : listQuery.isError ? (
            <p className="px-4 py-8 text-center text-destructive text-sm">
              {t("notifications.loadFailed", {
                defaultValue: "Failed to load notifications.",
              })}
            </p>
          ) : isEmpty ? (
            <InboxEmpty />
          ) : (
            <NotificationList
              grouped={false}
              laneFilter={lane}
              locale={locale}
              notifications={notifications}
              variant="inbox"
            />
          )}
        </div>
      </div>

      <Link
        className="flex shrink-0 items-center justify-center gap-1.5 border-border-soft border-t px-4 py-2.5 text-muted-foreground text-sm no-underline transition-colors hover:bg-muted/40 hover:text-foreground"
        onClick={onNavigate}
        to={href}
      >
        {t("notifications.viewAll", { defaultValue: "View all" })}
        <ChevronRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

function InboxEmpty() {
  const { t } = useTranslation("common");
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <Bell aria-hidden className="size-4 text-muted-foreground" />
      </span>
      <p className="font-medium text-sm">
        {t("notifications.emptyTitle", { defaultValue: "Nothing new" })}
      </p>
      <p className="mt-1 max-w-[16rem] text-muted-foreground text-xs leading-relaxed">
        {t("notifications.emptyHint", {
          defaultValue: "Approvals and updates land here.",
        })}
      </p>
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3 px-4 py-3">
      {[0, 1, 2].map((row) => (
        <div className="flex gap-2.5" key={row}>
          <div className="mt-0.5 size-4 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
            <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-2/5 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
