// The list: lanes (attention / needs you / errors / updates), one row per record with its
// deep link, the module-contributed body for its kind, and mark seen/dismiss.
// Rendered by the page, the bell and any module that embeds the inbox.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, TooltipProvider } from "@engenty/ui-core";
import { AlertTriangle, CheckCheck, ShieldCheck, Trash2 } from "lucide-react";
import { type ComponentType, type ReactNode, useState } from "react";
import type { NotificationDto } from "./api.js";
import {
  isError,
  isHitl,
  matchesLaneFilter,
  type NotificationLaneFilter,
} from "./classification.js";
import { notificationOrigin } from "./notification-href.js";
import { NotificationItem } from "./notification-item.js";
import { useMarkNotificationMutation } from "./queries.js";
import { NotificationSurfaceContext } from "./renderers.js";

export {
  notificationHref,
  notificationOrigin,
} from "./notification-href.js";

function ClearAllButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("common");
  return (
    <Button
      className="h-6 gap-1 px-1.5 text-muted-foreground text-xs"
      onClick={onClick}
      size="sm"
      variant="ghost"
    >
      <Trash2 className="h-3 w-3" />
      {t("notifications.clearAll", { defaultValue: "Clear all" })}
    </Button>
  );
}

export type NotificationListVariant = "page" | "inbox";

/**
 * FYI rows from one source (same kind, same actor, same space) fold into the
 * newest one: five desk posts from one Engenty are one line to read, not
 * five. Anything that wants a person stays its own row.
 */
export function groupRepeatedUpdates(
  notifications: NotificationDto[]
): { head: NotificationDto; rest: NotificationDto[] }[] {
  const groups: { head: NotificationDto; rest: NotificationDto[] }[] = [];
  const byKey = new Map<
    string,
    { head: NotificationDto; rest: NotificationDto[] }
  >();
  for (const notification of notifications) {
    const actor =
      typeof notification.metadata?.actor_ref === "string"
        ? notification.metadata.actor_ref
        : notification.actor_id;
    const key =
      notification.class === "update" && actor
        ? `${notification.kind}|${actor}|${notification.space_id ?? ""}`
        : null;
    const open = key ? byKey.get(key) : undefined;
    if (open) {
      open.rest.push(notification);
      continue;
    }
    const group = { head: notification, rest: [] as NotificationDto[] };
    groups.push(group);
    if (key) {
      byKey.set(key, group);
    }
  }
  return groups;
}

function NotificationRows({
  locale,
  notifications,
  variant,
}: {
  locale: string;
  notifications: NotificationDto[];
  variant: NotificationListVariant;
}) {
  const { t } = useTranslation("common");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  return (
    <>
      {groupRepeatedUpdates(notifications).map(({ head, rest }) => {
        const open = expanded.has(head.id);
        const who = notificationOrigin(head).actorLabel;
        return (
          <li className="list-none" key={head.id}>
            <ul className="flex flex-col">
              <NotificationItem
                locale={locale}
                notification={head}
                variant={variant}
              />
              {open
                ? rest.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      locale={locale}
                      notification={notification}
                      variant={variant}
                    />
                  ))
                : null}
            </ul>
            {rest.length > 0 ? (
              <button
                className={cn(
                  "text-muted-foreground text-xs hover:text-foreground",
                  variant === "inbox" ? "px-11 pb-2" : "px-3 pt-1"
                )}
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (open) {
                      next.delete(head.id);
                    } else {
                      next.add(head.id);
                    }
                    return next;
                  })
                }
                type="button"
              >
                {open
                  ? t("notifications.group.less", { defaultValue: "Show less" })
                  : who
                    ? t("notifications.group.moreFrom", {
                        count: rest.length,
                        defaultValue: "+{{count}} more from {{name}}",
                        name: who,
                      })
                    : t("notifications.group.more", {
                        count: rest.length,
                        defaultValue: "+{{count}} more",
                      })}
              </button>
            ) : null}
          </li>
        );
      })}
    </>
  );
}

function Section({
  icon: Icon,
  title,
  notifications,
  locale,
  tone,
  onClearAll,
  variant,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  notifications: NotificationDto[];
  locale: string;
  tone?: "primary" | "destructive";
  onClearAll?: (notifications: NotificationDto[]) => void;
  variant: NotificationListVariant;
}) {
  if (notifications.length === 0) {
    return null;
  }
  const inbox = variant === "inbox";
  return (
    <section className={inbox ? undefined : "space-y-2"}>
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          inbox ? "px-4 pt-3 pb-1" : undefined
        )}
      >
        <h2
          className={cn(
            "flex items-center gap-2 font-medium text-muted-foreground",
            inbox ? "text-xs" : "text-sm"
          )}
        >
          <Icon
            className={cn(
              "h-3.5 w-3.5",
              tone === "primary" && "text-primary",
              tone === "destructive" && "text-destructive"
            )}
          />
          {title}
          <span className="text-muted-foreground/70 tabular-nums">
            ({notifications.length})
          </span>
        </h2>
        {onClearAll ? (
          <ClearAllButton onClick={() => onClearAll(notifications)} />
        ) : null}
      </div>
      <ul className={cn("flex flex-col", inbox ? undefined : "gap-1.5")}>
        <NotificationRows
          locale={locale}
          notifications={notifications}
          variant={variant}
        />
      </ul>
    </section>
  );
}

export interface NotificationListProps {
  /** Bulk-clear sits under the list on an embed; the page keeps it on top. */
  clearAllPlacement?: "top" | "bottom";
  /** Extra actions in the bottom bar (e.g. an embed's "View all"). */
  footerStart?: ReactNode;
  /** When false, render a flat list (an embed's attention lane). */
  grouped?: boolean;
  laneFilter?: NotificationLaneFilter;
  locale: string;
  notifications: NotificationDto[];
  /** Inbox popover uses flat rows; the full page keeps raised cards. */
  variant?: NotificationListVariant;
}

export function NotificationList({
  clearAllPlacement = "top",
  footerStart,
  grouped = true,
  laneFilter = "all",
  locale,
  notifications,
  variant = "page",
}: NotificationListProps) {
  const { t } = useTranslation("common");
  const markMutation = useMarkNotificationMutation();

  const filtered = notifications.filter((n) =>
    matchesLaneFilter(n, laneFilter)
  );
  if (filtered.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("notifications.empty", {
          defaultValue:
            "Nothing new — approvals, failures and completed work land here.",
        })}
      </p>
    );
  }

  // A decision is answered, never cleared: it stays until someone decides it.
  const clearAll = (items: NotificationDto[]) => {
    for (const item of items) {
      if (item.class === "decision") {
        continue;
      }
      markMutation.mutate({ action: "dismiss", id: item.id });
    }
  };

  if (!grouped || laneFilter !== "all") {
    const canClear =
      laneFilter === "attention" ||
      laneFilter === "errors" ||
      laneFilter === "hitl" ||
      filtered.every((n) => isError(n) || isHitl(n));
    const showTopClear =
      canClear && clearAllPlacement === "top" && variant !== "inbox";
    const showBottomBar = Boolean(
      footerStart || (canClear && clearAllPlacement === "bottom")
    );
    return (
      <NotificationSurfaceContext.Provider value={variant}>
        <TooltipProvider delayDuration={300}>
          <div className="space-y-1.5">
            {showTopClear ? (
              <div className="flex justify-end">
                <ClearAllButton onClick={() => clearAll(filtered)} />
              </div>
            ) : null}
            <ul
              className={cn(
                "flex flex-col",
                variant === "inbox" ? undefined : "gap-1.5"
              )}
            >
              <NotificationRows
                locale={locale}
                notifications={filtered}
                variant={variant}
              />
            </ul>
            {showBottomBar ? (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
                <div className="min-w-0">{footerStart}</div>
                {canClear && clearAllPlacement === "bottom" ? (
                  <ClearAllButton onClick={() => clearAll(filtered)} />
                ) : null}
              </div>
            ) : null}
          </div>
        </TooltipProvider>
      </NotificationSurfaceContext.Provider>
    );
  }

  const hitl = filtered.filter(isHitl);
  const errors = filtered.filter(isError);
  const updates = filtered.filter((n) => n.class === "update");
  const canClearLane = (items: NotificationDto[]) =>
    items.some((item) => item.class !== "decision");
  return (
    <NotificationSurfaceContext.Provider value={variant}>
      <TooltipProvider delayDuration={300}>
        <div className={variant === "inbox" ? "pb-1" : "space-y-4"}>
          <Section
            icon={ShieldCheck}
            locale={locale}
            notifications={hitl}
            onClearAll={canClearLane(hitl) ? clearAll : undefined}
            title={t("notifications.lane.needsYou", {
              defaultValue: "Needs your input",
            })}
            tone="primary"
            variant={variant}
          />
          <Section
            icon={AlertTriangle}
            locale={locale}
            notifications={errors}
            onClearAll={canClearLane(errors) ? clearAll : undefined}
            title={t("notifications.lane.errors", { defaultValue: "Errors" })}
            tone="destructive"
            variant={variant}
          />
          <Section
            icon={CheckCheck}
            locale={locale}
            notifications={updates}
            onClearAll={canClearLane(updates) ? clearAll : undefined}
            title={t("notifications.lane.updates", { defaultValue: "Updates" })}
            variant={variant}
          />
        </div>
      </TooltipProvider>
    </NotificationSurfaceContext.Provider>
  );
}
