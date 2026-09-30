// /notifications — the full list with a search box, the lanes as a button
// group and, at the tenant root, a space filter. Inside a space (`/s/<key>/notifications`)
// the list is narrowed to that space; at the tenant root it is the aggregate.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  ListFilterChip,
  ListSearchInput,
  ListToolbar,
  ListToolbarFilterRow,
  ListToolbarMainArea,
  ListToolbarSearch,
  ListToolbarSummary,
  uiPageScrollClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { CheckCheck, LayoutGrid, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { NotificationDto } from "./api.js";
import {
  isUnseen,
  matchesLaneFilter,
  type NotificationLaneFilter,
} from "./classification.js";
import { notificationOrigin } from "./notification-href.js";
import { NotificationList } from "./notification-list.js";
import { NotificationsLaneFilter } from "./notifications-lane-filter.js";
import { useMarkAllSeenMutation, useNotificationsQuery } from "./queries.js";
import { useStreamsQuery } from "./streams-api.js";

export function NotificationsPage() {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language || "en";
  const { spaceKey } = useParams<{ spaceKey?: string }>();
  const [stream, setStream] = useState<string | null>(null);
  const listQuery = useNotificationsQuery({
    limit: 100,
    scope: spaceKey ? "space" : "tenant",
    ...(stream ? { stream } : {}),
  });
  const markAll = useMarkAllSeenMutation();
  const [search, setSearch] = useState("");
  const [lane, setLane] = useState<NotificationLaneFilter>("all");
  const [spaceId, setSpaceId] = useState("all");
  const streamsQuery = useStreamsQuery();
  const streams = streamsQuery.data?.streams ?? [];

  const notifications = listQuery.data?.notifications ?? [];
  const hasUnseen = notifications.some((n) => isUnseen(n));
  const title = t("notifications.title", { defaultValue: "Notifications" });

  const actions = useMemo(
    () => (
      <Button
        className="gap-1.5"
        disabled={markAll.isPending || !hasUnseen}
        onClick={() => markAll.mutate()}
        size="sm"
        variant="outline"
      >
        {markAll.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCheck className="h-3.5 w-3.5" />
        )}
        {t("notifications.markAllSeen", { defaultValue: "Mark all seen" })}
      </Button>
    ),
    [hasUnseen, markAll, t]
  );

  usePageConfig({
    actions,
    breadcrumbs: [{ label: title }],
    contentStackBackground: "paper",
    topbarOverlap: true,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((n: NotificationDto) => {
      if (!matchesLaneFilter(n, lane)) {
        return false;
      }
      if (spaceId !== "all" && n.space_id !== spaceId) {
        return false;
      }
      if (!q) {
        return true;
      }
      return `${n.summary} ${n.kind} ${n.source}`.toLowerCase().includes(q);
    });
  }, [lane, notifications, search, spaceId]);

  // The spaces the loaded rows come from, named as their cards name them.
  const spaceOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const n of notifications) {
      if (n.space_id && !names.has(n.space_id)) {
        const origin = notificationOrigin(n);
        names.set(
          n.space_id,
          origin.spaceName ?? origin.spaceKey ?? n.space_id
        );
      }
    }
    return [...names]
      .map(([value, label]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  }, [locale, notifications]);

  const spaceLabel = t("notifications.filter.space", { defaultValue: "Space" });
  const allSpacesLabel = t("notifications.filter.allSpaces", {
    defaultValue: "All spaces",
  });
  return (
    <div className={cn(uiPageScrollClassName, "ui-scroll-fade-t")}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-page pt-16 pb-10">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">
            {t("notifications.subtitle", {
              defaultValue:
                "Approvals, failures and completed agent work that need your attention.",
            })}
          </p>
        </div>
        {streams.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              onClick={() => setStream(null)}
              size="sm"
              variant={stream ? "ghost" : "secondary"}
            >
              {t("notifications.streams.inbox", { defaultValue: "Inbox" })}
            </Button>
            {streams.map((entry) => (
              <Button
                key={entry.id}
                onClick={() => setStream(entry.key)}
                size="sm"
                variant={stream === entry.key ? "secondary" : "ghost"}
              >
                {entry.name}
              </Button>
            ))}
          </div>
        ) : null}
        <ListToolbar>
          <ListToolbarMainArea className="group/toolbar-main">
            <ListToolbarSearch>
              <ListSearchInput
                className="w-full"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("notifications.searchPlaceholder", {
                  defaultValue: "Search notifications…",
                })}
                value={search}
                wrapperClassName="w-full"
              />
            </ListToolbarSearch>
            {/* On a phone the focused search takes the row; the count steps
                aside instead of wrapping under it. */}
            <ListToolbarSummary className="max-sm:group-focus-within/toolbar-main:hidden">
              {t("notifications.count", {
                count: filtered.length,
                defaultValue: "{{count}} items",
              })}
            </ListToolbarSummary>
          </ListToolbarMainArea>
          <ListToolbarFilterRow className="flex-nowrap">
            <NotificationsLaneFilter onChange={setLane} value={lane} />
            {spaceKey || spaceOptions.length === 0 ? null : (
              <ListFilterChip
                activeLabel={
                  spaceOptions.find((option) => option.value === spaceId)?.label
                }
                ariaLabel={spaceLabel}
                className="min-w-0 shrink"
                clearLabel={allSpacesLabel}
                icon={LayoutGrid}
                isActive={spaceId !== "all"}
                label={spaceLabel}
                onClear={() => setSpaceId("all")}
                onSelect={setSpaceId}
                options={spaceOptions}
                value={spaceId}
              />
            )}
          </ListToolbarFilterRow>
        </ListToolbar>
        {listQuery.isPending ? (
          <p className="text-muted-foreground text-sm">
            {t("notifications.loading", { defaultValue: "Loading…" })}
          </p>
        ) : listQuery.isError ? (
          <p className="text-destructive text-sm">
            {t("notifications.loadFailed", {
              defaultValue: "Failed to load notifications.",
            })}
          </p>
        ) : (
          <NotificationList
            laneFilter={lane}
            locale={locale}
            notifications={filtered}
          />
        )}
      </div>
    </div>
  );
}
