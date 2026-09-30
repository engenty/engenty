// The list on the full page and in module embeds (the tasks briefing): the
// same cards and stacks as the bell, split into what needs a person and
// FYI, with the module-contributed body for a decision that is decided in
// place.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, TooltipProvider } from "@engenty/ui-core";
import { Bell, CheckCheck, ChevronDown, ChevronUp } from "lucide-react";
import { type ComponentType, type ReactNode, useState } from "react";
import type { NotificationDto } from "./api.js";
import {
  canMarkSeen,
  isAttention,
  matchesLaneFilter,
  type NotificationLaneFilter,
} from "./classification.js";
import { NotificationStacks } from "./notification-stack.js";
import { useMarkSeenMutation } from "./queries.js";
import { NotificationSurfaceContext } from "./renderers.js";

export {
  notificationHref,
  notificationOrigin,
} from "./notification-href.js";

type Lane = "attention" | "updates";

function MarkAllSeenButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("common");
  return (
    <Button
      className="h-6 gap-1 px-1.5 text-muted-foreground text-xs"
      onClick={onClick}
      size="sm"
      variant="ghost"
    >
      <CheckCheck className="h-3 w-3" />
      {t("notifications.markAllSeen", { defaultValue: "Mark all seen" })}
    </Button>
  );
}

function useMarkAllSeen() {
  const mark = useMarkSeenMutation();
  return (items: NotificationDto[]) => {
    const ids = items.filter(canMarkSeen).map((item) => item.id);
    if (ids.length > 0) {
      mark.mutate(ids);
    }
  };
}

function Section({
  icon: Icon,
  lane,
  locale,
  notifications,
  onClearAll,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  lane: Lane;
  locale: string;
  notifications: NotificationDto[];
  onClearAll: (notifications: NotificationDto[]) => void;
  title: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (notifications.length === 0) {
    return null;
  }
  const clearable = notifications.some(canMarkSeen);
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium text-muted-foreground text-sm">
          {/* Opens or folds every stack in the section at once. */}
          <button
            aria-expanded={expanded}
            className="group/heading flex items-center gap-2 rounded-sm hover:text-foreground"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            <Icon className="h-3.5 w-3.5" />
            {title}
            <span className="text-muted-foreground/70 tabular-nums">
              ({notifications.length})
            </span>
            <Chevron
              aria-hidden
              className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover/heading:opacity-100 group-focus-visible/heading:opacity-100"
            />
          </button>
        </h2>
        {clearable ? (
          <MarkAllSeenButton onClick={() => onClearAll(notifications)} />
        ) : null}
      </div>
      <NotificationStacks
        expanded={expanded}
        locale={locale}
        notifications={notifications}
        variant="page"
      />
    </section>
  );
}

export interface NotificationListProps {
  /** Bulk-clear sits under the list on an embed; the page keeps it on top. */
  clearAllPlacement?: "top" | "bottom";
  /** Extra actions in the bottom bar (e.g. an embed's "View all"). */
  footerStart?: ReactNode;
  /** When false, one column of stacks instead of the two sections. */
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
  const clearAll = useMarkAllSeen();

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

  if (!grouped || laneFilter !== "all") {
    const lane: Lane = laneFilter === "updates" ? "updates" : "attention";
    const canClear = filtered.some(canMarkSeen);
    const showBottomBar = Boolean(
      footerStart || (canClear && clearAllPlacement === "bottom")
    );
    return (
      <NotificationSurfaceContext.Provider value="page">
        <TooltipProvider delayDuration={300}>
          <div className="space-y-2">
            {canClear && clearAllPlacement === "top" ? (
              <div className="flex justify-end">
                <MarkAllSeenButton onClick={() => clearAll(filtered)} />
              </div>
            ) : null}
            <NotificationStacks
              locale={locale}
              notifications={filtered}
              variant="page"
            />
            {showBottomBar ? (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
                <div className="min-w-0">{footerStart}</div>
                {canClear && clearAllPlacement === "bottom" ? (
                  <MarkAllSeenButton onClick={() => clearAll(filtered)} />
                ) : null}
              </div>
            ) : null}
          </div>
        </TooltipProvider>
      </NotificationSurfaceContext.Provider>
    );
  }

  return (
    <NotificationSurfaceContext.Provider value="page">
      <TooltipProvider delayDuration={300}>
        <div className="space-y-6">
          <Section
            icon={Bell}
            lane="attention"
            locale={locale}
            notifications={filtered.filter(isAttention)}
            onClearAll={clearAll}
            title={t("notifications.lane.attention", {
              defaultValue: "Notifications",
            })}
          />
          <Section
            icon={CheckCheck}
            lane="updates"
            locale={locale}
            notifications={filtered.filter((n) => !isAttention(n))}
            onClearAll={clearAll}
            title={t("notifications.lane.updates", { defaultValue: "Updates" })}
          />
        </div>
      </TooltipProvider>
    </NotificationSurfaceContext.Provider>
  );
}
