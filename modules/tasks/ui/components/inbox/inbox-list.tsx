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
import { Button, cn } from "@engenty/ui-core";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  GitPullRequestArrow,
  Link2,
  ShieldCheck,
  X,
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
  const detail = resultText(notification);

  const summaryNode = (
    <span
      className={cn(
        "font-medium text-sm leading-snug",
        unseen ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {notification.summary}
    </span>
  );

  return (
    <li
      className={cn(
        "ui-canvas-raised flex items-start gap-3 rounded-lg border p-3.5",
        unseen ? "bg-card" : "bg-muted/20",
        failure && "border-destructive/30"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          failure ? "text-destructive" : "text-muted-foreground"
        )}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {href ? (
            <Link className="hover:underline" to={href}>
              {summaryNode}
            </Link>
          ) : (
            summaryNode
          )}
          <span className="text-muted-foreground text-xs tabular-nums">
            {relativeTime(notification.createdAt, locale)}
          </span>
        </div>
        {detail ? (
          <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground text-sm leading-snug">
            {detail}
          </p>
        ) : null}
        {href ? (
          <Link
            className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
            to={href}
          >
            {t("inbox.openSubject")}
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {unseen && (
          <Button
            aria-label={t("inbox.markSeen")}
            className="h-7 w-7"
            disabled={markMutation.isPending}
            onClick={() =>
              markMutation.mutate({ action: "seen", id: notification.id })
            }
            size="icon"
            title={t("inbox.markSeen")}
            variant="ghost"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          aria-label={t("inbox.dismiss")}
          className="h-7 w-7"
          disabled={markMutation.isPending}
          onClick={() =>
            markMutation.mutate({ action: "dismiss", id: notification.id })
          }
          size="icon"
          title={t("inbox.dismiss")}
          variant="ghost"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function InboxSection({
  icon: Icon,
  title,
  notifications,
  locale,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  notifications: InboxNotificationDto[];
  locale: string;
  tone?: "primary";
}) {
  if (notifications.length === 0) {
    return null;
  }
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
        <Icon
          className={cn("h-3.5 w-3.5", tone === "primary" && "text-primary")}
        />
        {title}
        <span className="text-muted-foreground/70">
          ({notifications.length})
        </span>
      </h2>
      <ul className="grid gap-2 lg:grid-cols-2">
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

  if (notifications.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("inbox.empty")}</p>;
  }

  const needsInput = notifications.filter(isNeedsInput);
  const informational = notifications.filter((n) => !isNeedsInput(n));

  return (
    <div className="space-y-6">
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
        title={t("inbox.notifications")}
      />
    </div>
  );
}
