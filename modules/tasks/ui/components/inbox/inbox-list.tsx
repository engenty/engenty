// Inbox entries (Mastra notification records) — shared by the inbox page and
// the Briefing section. Split into two lanes: "Needs input" (HITL — approvals,
// proposals, failures that require a human decision) above "Notifications"
// (informational — completed agent work, mentions). Each entry shows the
// agent's actual result text so it says what happened, not just "task X done".
import {
  type InboxNotificationDto,
  useMarkInboxNotificationMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { AnimatedCheckIcon } from "@engenty/ui-icons";
import {
  AlertTriangle,
  Bot,
  CheckCheck,
  GitPullRequestArrow,
  Link2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { tasksPaths } from "../../lib/tasks-routes.js";

/** Kinds that require a human decision (approve/reject/review) — the HITL lane. */
const NEEDS_INPUT_KINDS = new Set([
  "tool_approval",
  "connection_approval_requested",
  "agent_proposed",
  "skill_proposed",
  "memory_proposal",
  "task_failed",
  "trigger_failed",
]);

function isNeedsInput(n: InboxNotificationDto): boolean {
  return NEEDS_INPUT_KINDS.has(n.kind);
}

function relativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return "";
  }
  const deltaSeconds = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const table: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, seconds] of table) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return rtf.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return rtf.format(deltaSeconds, "second");
}

function isUnseen(notification: InboxNotificationDto): boolean {
  return (
    notification.status === "pending" || notification.status === "delivered"
  );
}

/** Deep link for a notification's subject, when its metadata names one. */
function notificationHref(notification: InboxNotificationDto): string | null {
  const taskId = notification.metadata?.task_id;
  return typeof taskId === "string" ? tasksPaths.taskDetail(taskId) : null;
}

/** The agent's result text captured on the notification payload, if any. */
function resultText(notification: InboxNotificationDto): string | null {
  const raw = notification.payload?.result_text;
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function iconForKind(
  notification: InboxNotificationDto
): ComponentType<{ className?: string }> {
  switch (notification.kind) {
    case "task_failed":
    case "trigger_failed":
      return AlertTriangle;
    case "connection_approval_requested":
    case "tool_approval":
      return ShieldCheck;
    case "agent_proposed":
      return Bot;
    case "skill_proposed":
    case "memory_proposal":
      return GitPullRequestArrow;
    default:
      return CheckCheck;
  }
}

function InboxItem({
  notification,
  locale,
}: {
  notification: InboxNotificationDto;
  locale: string;
}) {
  const { t } = useTranslation("tasks");
  const markMutation = useMarkInboxNotificationMutation();
  const unseen = isUnseen(notification);
  const href = notificationHref(notification);
  const failure =
    notification.kind === "task_failed" ||
    notification.kind === "trigger_failed";
  const Icon = iconForKind(notification);
  // Collapse whitespace so the preview is a clean flowing snippet — no lone
  // blank/"…" lines eating a row.
  const detail = resultText(notification)?.replace(/\s+/g, " ").trim() || null;

  const summaryNode = (
    <span
      className={cn(
        "font-medium text-sm leading-tight",
        unseen ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {notification.summary}
    </span>
  );

  return (
    <li
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2",
        unseen ? "bg-card" : "bg-muted/20",
        failure && "border-destructive/30"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          failure ? "text-destructive" : "text-muted-foreground"
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          {href ? (
            <Link className="min-w-0 truncate hover:underline" to={href}>
              {summaryNode}
            </Link>
          ) : (
            summaryNode
          )}
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {relativeTime(notification.createdAt, locale)}
          </span>
        </div>
        {detail ? (
          <p className="line-clamp-2 text-muted-foreground text-xs leading-snug">
            {detail}
          </p>
        ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t("inbox.markSeen")}
            className="group h-6 w-6 shrink-0 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
            disabled={markMutation.isPending}
            onClick={() =>
              markMutation.mutate({ action: "seen", id: notification.id })
            }
            size="icon"
            variant="ghost"
          >
            <AnimatedCheckIcon aria-hidden play="hover" size="sm" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{t("inbox.markSeen")}</TooltipContent>
      </Tooltip>
    </li>
  );
}

function InboxSection({
  icon: Icon,
  title,
  notifications,
  locale,
  tone,
  onClearAll,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  notifications: InboxNotificationDto[];
  locale: string;
  tone?: "primary";
  onClearAll?: (notifications: InboxNotificationDto[]) => void;
}) {
  const { t } = useTranslation("tasks");
  if (notifications.length === 0) {
    return null;
  }
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          <Icon
            className={cn("h-3.5 w-3.5", tone === "primary" && "text-primary")}
          />
          {title}
          <span className="text-muted-foreground/70">
            ({notifications.length})
          </span>
        </h2>
        {onClearAll ? (
          <Button
            className="h-6 gap-1 px-1.5 text-muted-foreground text-xs"
            onClick={() => onClearAll(notifications)}
            size="sm"
            variant="ghost"
          >
            <Trash2 className="h-3 w-3" />
            {t("inbox.clearAll")}
          </Button>
        ) : null}
      </div>
      <ul className="space-y-1.5">
        {notifications.map((notification) => (
          <InboxItem
            key={notification.id}
            locale={locale}
            notification={notification}
          />
        ))}
      </ul>
    </section>
  );
}

export function InboxList({
  locale,
  notifications,
}: {
  locale: string;
  notifications: InboxNotificationDto[];
}) {
  const { t } = useTranslation("tasks");
  const markMutation = useMarkInboxNotificationMutation();

  if (notifications.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("inbox.empty")}</p>;
  }

  const needsInput = notifications.filter(isNeedsInput);
  const informational = notifications.filter((n) => !isNeedsInput(n));

  const clearAll = (items: InboxNotificationDto[]) => {
    for (const item of items) {
      markMutation.mutate({ action: "dismiss", id: item.id });
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-5">
        <InboxSection
          icon={ShieldCheck}
          locale={locale}
          notifications={needsInput}
          title={t("inbox.needsInput")}
          tone="primary"
        />
        <InboxSection
          icon={Link2}
          locale={locale}
          notifications={informational}
          onClearAll={clearAll}
          title={t("inbox.notifications")}
        />
      </div>
    </TooltipProvider>
  );
}
