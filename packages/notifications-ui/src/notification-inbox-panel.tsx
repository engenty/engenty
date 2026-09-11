// The compact inbox: a card with a title, the list, and a footer out to
// the full page. Shared by the rail bell and the space dashboard bell.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, ScrollArea } from "@engenty/ui-core";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isUnseen } from "./classification.js";
import { NotificationList } from "./notification-list.js";
import { NOTIFICATIONS_PATH, spaceInboxPath } from "./notification-paths.js";
import { useMarkAllSeenMutation, useNotificationsQuery } from "./queries.js";

/** Width + padding for the popover chrome. The panel owns internal spacing. */
export const notificationInboxPopoverClassName =
  "w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg p-0";

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
  const listQuery = useNotificationsQuery({ limit: 50, scope });
  const markAll = useMarkAllSeenMutation();
  const notifications = listQuery.data?.notifications ?? [];
  const hasUnseen = notifications.some((n) => isUnseen(n));
  const showScopeToggle = inSpace && !scopeLocked;
  const href =
    viewAllHref ??
    (spaceKey && scope === "space"
      ? spaceInboxPath(spaceKey)
      : NOTIFICATIONS_PATH);
  const isEmpty =
    !(listQuery.isPending || listQuery.isError) && notifications.length === 0;

  return (
    <div
      className="flex min-h-0 w-full flex-col"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) {
          onNavigate();
        }
      }}
    >
      <header className="flex items-start justify-between gap-3 border-border/70 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm tracking-tight">
            {t("notifications.title", { defaultValue: "Notifications" })}
          </p>
          {showScopeToggle ? (
            <span className="mt-1.5 inline-flex rounded-md bg-muted p-0.5 font-normal text-xs">
              {(["space", "global"] as const).map((value) => (
                <button
                  aria-pressed={scope === value}
                  className={cn(
                    "rounded px-1.5 py-0.5 transition-colors",
                    scope === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  key={value}
                  onClick={() => setScope(value)}
                  type="button"
                >
                  {value === "space"
                    ? t("notifications.scope.thisSpace", {
                        defaultValue: "This space",
                      })
                    : t("notifications.scope.all", { defaultValue: "All" })}
                </button>
              ))}
            </span>
          ) : null}
        </div>
        {hasUnseen ? (
          <Button
            aria-label={t("notifications.markAllSeen", {
              defaultValue: "Mark all seen",
            })}
            className="size-7 shrink-0 text-muted-foreground"
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
      </header>

      <div className="min-h-[12rem]">
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
          <ScrollArea className="max-h-[min(24rem,60vh)]">
            <div className="px-2 pb-2">
              <NotificationList locale={locale} notifications={notifications} />
            </div>
          </ScrollArea>
        )}
      </div>

      <Link
        className="flex items-center justify-between gap-2 border-border/70 border-t px-4 py-2.5 text-muted-foreground text-sm transition-colors hover:bg-muted/60 hover:text-foreground"
        onClick={onNavigate}
        to={href}
      >
        {t("notifications.viewAll", { defaultValue: "View all" })}
        <ChevronRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}

function InboxEmpty() {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
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
