// The list: lanes (needs you / errors / updates), one row per record with its
// deep link, the module-contributed body for its kind, and mark seen/dismiss.
// Rendered by the page, the bell and any module that embeds the inbox.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, TooltipProvider } from "@engenty/ui-core";
import { AlertTriangle, CheckCheck, ShieldCheck, Trash2 } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { NotificationDto } from "./api.js";
import {
  isError,
  isHitl,
  isNeedsInput,
  matchesLaneFilter,
  type NotificationLaneFilter,
} from "./classification.js";
import { NotificationItem } from "./notification-item.js";
import { useMarkNotificationMutation } from "./queries.js";

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

function Section({
  icon: Icon,
  title,
  notifications,
  locale,
  tone,
  onClearAll,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  notifications: NotificationDto[];
  locale: string;
  tone?: "primary" | "destructive";
  onClearAll?: (notifications: NotificationDto[]) => void;
}) {
  if (notifications.length === 0) {
    return null;
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
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
      <ul className="flex flex-col gap-1.5">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            locale={locale}
            notification={notification}
          />
        ))}
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
}

export function NotificationList({
  clearAllPlacement = "top",
  footerStart,
  grouped = true,
  laneFilter = "all",
  locale,
  notifications,
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
      laneFilter === "errors" ||
      laneFilter === "hitl" ||
      filtered.every((n) => isError(n) || isHitl(n));
    const showTopClear = canClear && clearAllPlacement === "top";
    const showBottomBar = Boolean(
      footerStart || (canClear && clearAllPlacement === "bottom")
    );
    return (
      <TooltipProvider delayDuration={300}>
        <div className="space-y-1.5">
          {showTopClear ? (
            <div className="flex justify-end">
              <ClearAllButton onClick={() => clearAll(filtered)} />
            </div>
          ) : null}
          <ul className="flex flex-col gap-1.5">
            {filtered.map((notification) => (
              <NotificationItem
                key={notification.id}
                locale={locale}
                notification={notification}
              />
            ))}
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
    );
  }

  const hitl = filtered.filter(isHitl);
  const errors = filtered.filter(isError);
  const updates = filtered.filter((n) => !isNeedsInput(n));
  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        <Section
          icon={ShieldCheck}
          locale={locale}
          notifications={hitl}
          onClearAll={clearAll}
          title={t("notifications.lane.needsYou", {
            defaultValue: "Needs your input",
          })}
          tone="primary"
        />
        <Section
          icon={AlertTriangle}
          locale={locale}
          notifications={errors}
          onClearAll={clearAll}
          title={t("notifications.lane.errors", { defaultValue: "Errors" })}
          tone="destructive"
        />
        <Section
          icon={CheckCheck}
          locale={locale}
          notifications={updates}
          onClearAll={clearAll}
          title={t("notifications.lane.updates", { defaultValue: "Updates" })}
        />
      </div>
    </TooltipProvider>
  );
}
