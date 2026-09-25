// The compact inbox: lane tabs, the list, and a footer out to the full page.
// Shared by the rail bell and the space dashboard bell.
import { currentRequestSpaceId } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  cn,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { Bell, CheckCheck, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { isUnseen, matchesLaneFilter } from "./classification.js";
import type { InboxLane, InboxOpenRequest } from "./inbox-open.js";
import { NotificationList } from "./notification-list.js";
import {
  NOTIFICATIONS_PATH,
  spaceInboxPath,
  spaceKeyFromPathname,
} from "./notification-paths.js";
import {
  ATTENTION_SCAN_LIMIT,
  useMarkAllSeenMutation,
  useNotificationsQuery,
} from "./queries.js";

/** Width + padding for the popover chrome. Height is fixed so lane switches never resize it. */
export const notificationInboxPopoverClassName =
  "z-[100] flex h-[min(40rem,calc(100dvh-1.5rem))] min-h-[min(40rem,calc(100dvh-1.5rem))] w-[min(32rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0";

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
    defaultLabel: "Important",
    labelKey: "notifications.lane.attention",
    titleDefault: "{{count}} important",
    titleKey: "notifications.inboxTitle.attention",
    value: "attention",
  },
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
  /** Opened for a lane / one actor (`openNotificationInbox`). */
  initial?: InboxOpenRequest | null;
  /** Standing in a space: the panel opens narrowed to it, with a way out. */
  inSpace: boolean;
  onNavigate: () => void;
  /**
   * When set, the list stays on that scope. The switch keeps the same shape
   * but shows only the locked side (Space on the dashboard bell).
   */
  scopeLocked?: "space" | "tenant";
  /** Overrides the "View all" destination. */
  viewAllHref?: string;
}

export function NotificationInboxPanel({
  inSpace,
  initial,
  onNavigate,
  scopeLocked,
  viewAllHref,
}: NotificationInboxPanelProps) {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language || "en";
  const { pathname } = useLocation();
  const { spaceKey: paramSpaceKey } = useParams<{ spaceKey?: string }>();
  const spaceKey = paramSpaceKey ?? spaceKeyFromPathname(pathname) ?? undefined;
  const standingInSpace = inSpace || Boolean(spaceKey);
  const [scope, setScope] = useState<"space" | "tenant">(
    scopeLocked ?? (inSpace ? "space" : "tenant")
  );
  const [lane, setLane] = useState<InboxLane>(initial?.lane ?? "attention");
  const [actor, setActor] = useState(initial?.actor ?? null);
  const listQuery = useNotificationsQuery({
    limit: ATTENTION_SCAN_LIMIT,
    scope,
  });
  const markAll = useMarkAllSeenMutation();
  const spaceId = currentRequestSpaceId();
  const notifications = (listQuery.data?.notifications ?? []).filter(
    (n) =>
      (scope === "space" ? Boolean(spaceId) && n.space_id === spaceId : true) &&
      (actor ? n.actor_id === actor.id : true)
  );
  const visible = notifications.filter((n) => matchesLaneFilter(n, lane));
  const hasUnseen = visible.some((n) => isUnseen(n));
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
              // Wichtig is the bell's number; Freigaben + Fehler are its
              // parts. Updates are FYI — listed, not badged.
              const showBadge = tab.value !== "updates" && count > 0;
              return (
                <TabsTrigger
                  className="gap-1.5 px-3"
                  key={tab.value}
                  value={tab.value}
                >
                  {t(tab.labelKey, { defaultValue: tab.defaultLabel })}
                  {showBadge ? (
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
        {standingInSpace ? (
          <div className="-mb-px flex h-9 shrink-0 items-center">
            <InboxScopeSwitch
              locked={scopeLocked}
              onChange={setScope}
              scope={scope}
            />
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-border-soft border-b bg-background px-4">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate font-medium text-muted-foreground text-xs">
              {listQuery.isPending
                ? t("notifications.loading", { defaultValue: "Loading…" })
                : t(activeTab.titleKey, {
                    count: visible.length,
                    defaultValue: activeTab.titleDefault,
                  })}
            </h2>
            {actor ? (
              <button
                aria-label={t("notifications.actorFilter.clear", {
                  defaultValue: "Show everyone",
                })}
                className="inline-flex min-w-0 shrink items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-foreground text-xs hover:text-muted-foreground"
                onClick={() => setActor(null)}
                type="button"
              >
                <span className="truncate">{actor.label}</span>
                <X aria-hidden className="size-3 shrink-0" />
              </button>
            ) : null}
          </div>
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

const SCOPE_OPTIONS = ["space", "tenant"] as const;

function InboxScopeSwitch({
  locked,
  onChange,
  scope,
}: {
  locked?: "space" | "tenant";
  onChange: (scope: "space" | "tenant") => void;
  scope: "space" | "tenant";
}) {
  const { t } = useTranslation("common");
  const options = locked ? ([locked] as const) : SCOPE_OPTIONS;
  const labelFor = (value: "space" | "tenant") =>
    value === "space"
      ? t("notifications.scope.space", { defaultValue: "Space" })
      : t("notifications.scope.tenant", { defaultValue: "Tenant" });

  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-muted p-0.5 font-normal text-xs">
      {options.map((value) => {
        const selected = scope === value;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "rounded-full px-2 py-0.5",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              locked && "cursor-default disabled:opacity-100"
            )}
            disabled={Boolean(locked)}
            key={value}
            onClick={locked ? undefined : () => onChange(value)}
            type="button"
          >
            {labelFor(value)}
          </button>
        );
      })}
    </span>
  );
}
