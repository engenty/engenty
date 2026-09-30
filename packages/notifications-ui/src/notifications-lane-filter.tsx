// The lanes as one button group. Two markers slide between the buttons: the
// active lane's, and a lighter one under the pointer. On a phone the lanes
// are their icons only, so choosing one never changes the row's width.
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Inbox,
  type LucideIcon,
  MessageCircleQuestion,
} from "lucide-react";
import {
  LayoutGroup,
  MotionConfig,
  motion,
  type Transition,
} from "motion/react";
import { useId, useState } from "react";
import type { NotificationLaneFilter } from "./classification.js";

const LANES: NotificationLaneFilter[] = [
  "all",
  "attention",
  "hitl",
  "errors",
  "updates",
];

/** Notifications and Updates carry their section headings' icons. */
const LANE_ICONS: Record<NotificationLaneFilter, LucideIcon> = {
  all: Inbox,
  attention: Bell,
  errors: AlertTriangle,
  hitl: MessageCircleQuestion,
  updates: CheckCheck,
};

const MARKER_TRANSITION: Transition = {
  bounce: 0,
  duration: 0.3,
  type: "spring",
};

export function NotificationsLaneFilter({
  onChange,
  value,
}: {
  onChange: (lane: NotificationLaneFilter) => void;
  value: NotificationLaneFilter;
}) {
  const { t } = useTranslation("common");
  const groupId = useId();
  const [hovered, setHovered] = useState<NotificationLaneFilter | null>(null);
  const labels: Record<NotificationLaneFilter, string> = {
    all: t("notifications.filter.all", { defaultValue: "All" }),
    attention: t("notifications.filter.attention", {
      defaultValue: "Important",
    }),
    errors: t("notifications.filter.errors", { defaultValue: "Errors" }),
    hitl: t("notifications.filter.hitl", {
      defaultValue: "Needs your input",
    }),
    updates: t("notifications.filter.updates", { defaultValue: "Updates" }),
  };
  return (
    <MotionConfig reducedMotion="user" transition={MARKER_TRANSITION}>
      <LayoutGroup id={groupId}>
        <div
          aria-label={t("notifications.filter.label", {
            defaultValue: "Filter",
          })}
          className="inline-flex h-8 shrink-0 items-center rounded-full border border-card bg-card p-0.5 [box-shadow:var(--shadow-ember-elevated)]"
          onPointerLeave={() => setHovered(null)}
          role="group"
        >
          {LANES.map((lane) => {
            const Icon = LANE_ICONS[lane];
            const active = lane === value;
            return (
              <button
                aria-label={labels[lane]}
                aria-pressed={active}
                className={cn(
                  "relative inline-flex h-full shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={lane}
                onClick={() => onChange(lane)}
                onPointerEnter={() => setHovered(lane)}
                type="button"
              >
                {hovered === lane && !active ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-accent/60"
                    layoutId="lane-hover"
                  />
                ) : null}
                {active ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-accent"
                    layoutId="lane-active"
                  />
                ) : null}
                <Icon aria-hidden className="relative size-3.5" />
                <span className="relative max-sm:hidden">{labels[lane]}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
