// /notifications — the full list with lanes, a search box and a lane filter.
// Inside a space (`/s/<key>/notifications`) the list is narrowed to that
// space; at the tenant root it is the aggregate.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Input,
  ListFilterSelectTrigger,
  ListSearchInput,
  ListToolbar,
  ListToolbarMainArea,
  ListToolbarSearch,
  ListToolbarSummary,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  uiPageScrollClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Bookmark, BookmarkPlus, CheckCheck, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { NotificationDto } from "./api.js";
import {
  isUnseen,
  matchesLaneFilter,
  type NotificationLaneFilter,
} from "./classification.js";
import { NotificationList } from "./notification-list.js";
import { useMarkAllSeenMutation, useNotificationsQuery } from "./queries.js";
import { useStreamsQuery } from "./streams-api.js";
import {
  readSavedViews,
  type SavedView,
  useNotificationSettingsQuery,
  useSetNotificationSettingMutation,
  VIEWS_SETTING,
} from "./user-prefs.js";

const LANES: NotificationLaneFilter[] = ["all", "hitl", "errors", "updates"];

export function NotificationsPage() {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language || "en";
  const { spaceKey } = useParams<{ spaceKey?: string }>();
  const [stream, setStream] = useState<string | null>(null);
  const listQuery = useNotificationsQuery({
    limit: 100,
    scope: spaceKey ? "space" : "global",
    ...(stream ? { stream } : {}),
  });
  const markAll = useMarkAllSeenMutation();
  const [search, setSearch] = useState("");
  const [lane, setLane] = useState<NotificationLaneFilter>("all");
  const streamsQuery = useStreamsQuery();
  const streams = streamsQuery.data?.streams ?? [];
  // Saved views: a personal filter set (lane, stream, search) kept on
  // core.user_settings — the personal counterpart to a shared stream.
  const settings = useNotificationSettingsQuery();
  const setSetting = useSetNotificationSettingMutation();
  const views = readSavedViews(settings.data);
  const applyView = (view: SavedView) => {
    setLane(view.filter.lane ?? "all");
    setStream(view.filter.stream ?? null);
    setSearch(view.filter.search ?? "");
  };
  const [viewName, setViewName] = useState<string | null>(null);
  const saveView = () => {
    const name = viewName?.trim();
    if (!name) {
      return;
    }
    const next: SavedView[] = [
      ...views.filter((view) => view.name !== name),
      {
        filter: {
          lane,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(stream ? { stream } : {}),
        },
        name,
      },
    ];
    setSetting.mutate({ name: VIEWS_SETTING, value: { views: next } });
    setViewName(null);
  };
  const deleteView = (name: string) => {
    const next = views.filter((view) => view.name !== name);
    setSetting.mutate({
      name: VIEWS_SETTING,
      value: next.length > 0 ? { views: next } : null,
    });
  };

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
      if (!q) {
        return true;
      }
      return `${n.summary} ${n.kind} ${n.source}`.toLowerCase().includes(q);
    });
  }, [lane, notifications, search]);

  const laneLabel = (value: NotificationLaneFilter) =>
    ({
      all: t("notifications.filter.all", { defaultValue: "All" }),
      errors: t("notifications.filter.errors", { defaultValue: "Errors" }),
      hitl: t("notifications.filter.hitl", {
        defaultValue: "Needs your input",
      }),
      updates: t("notifications.filter.updates", { defaultValue: "Updates" }),
    })[value];

  return (
    <div className={uiPageScrollClassName}>
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
        {streams.length > 0 || views.length > 0 ? (
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
            {views.length > 0 ? (
              <span className="mx-1 h-4 w-px bg-border" />
            ) : null}
            {views.map((view) => (
              <span className="inline-flex items-center" key={view.name}>
                <Button
                  className="gap-1.5"
                  onClick={() => applyView(view)}
                  size="sm"
                  variant="ghost"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  {view.name}
                </Button>
                <Button
                  aria-label={t("notifications.views.delete", {
                    defaultValue: "Delete view",
                  })}
                  className="h-6 w-6 text-muted-foreground"
                  onClick={() => deleteView(view.name)}
                  size="icon"
                  variant="ghost"
                >
                  ×
                </Button>
              </span>
            ))}
          </div>
        ) : null}
        <ListToolbar>
          <ListToolbarMainArea>
            <ListToolbarSearch>
              <ListSearchInput
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("notifications.searchPlaceholder", {
                  defaultValue: "Search notifications…",
                })}
                value={search}
              />
            </ListToolbarSearch>
            <Select
              onValueChange={(value) =>
                setLane(value as NotificationLaneFilter)
              }
              value={lane}
            >
              <ListFilterSelectTrigger>
                <SelectValue />
              </ListFilterSelectTrigger>
              <SelectContent>
                {LANES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {laneLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* A saved view is a filter, so it is saved from the filter. */}
            {viewName === null ? (
              <Button
                aria-label={t("notifications.views.save", {
                  defaultValue: "Save current filter",
                })}
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setViewName("")}
                size="icon"
                title={t("notifications.views.save", {
                  defaultValue: "Save current filter",
                })}
                variant="ghost"
              >
                <BookmarkPlus className="h-4 w-4" />
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Input
                  aria-label={t("notifications.views.name", {
                    defaultValue: "View name",
                  })}
                  className="h-7 w-[160px]"
                  onChange={(event) => setViewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      saveView();
                    }
                    if (event.key === "Escape") {
                      setViewName(null);
                    }
                  }}
                  placeholder={t("notifications.views.name", {
                    defaultValue: "View name",
                  })}
                  value={viewName}
                />
                <Button
                  disabled={setSetting.isPending || !viewName.trim()}
                  onClick={saveView}
                  size="sm"
                  variant="outline"
                >
                  {t("notifications.views.confirm", { defaultValue: "Save" })}
                </Button>
              </span>
            )}
          </ListToolbarMainArea>
          <ListToolbarSummary>
            {t("notifications.count", {
              count: filtered.length,
              defaultValue: "{{count}} items",
            })}
          </ListToolbarSummary>
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
