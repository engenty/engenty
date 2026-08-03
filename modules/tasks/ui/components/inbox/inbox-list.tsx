// Inbox entries (Mastra notification records) — shared by the inbox page and
// the Briefing section. Split into lanes: HITL approvals, errors, then
// informational updates. Each entry shows the agent's result text so it says
// what happened, not just "task X done".
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
import {
  type InboxKindFilter,
  isError,
  isHitl,
  isNeedsInput,
  matchesInboxKindFilter,
} from "../../lib/inbox-classification.js";
import { tasksPaths } from "../../lib/tasks-routes.js";
import { ToolApprovalActions } from "./tool-approval-actions.js";

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
    case "task_review_requested":
      return GitPullRequestArrow;
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

/** Metadata carried by a `tool_approval` needs-input notification. */
function toolApprovalContext(notification: InboxNotificationDto): {
  operationId: string;
  taskId: string;
  triggerId: string | null;
  title: string | null;
  riskLevel: string | null;
} | null {
  if (notification.kind !== "tool_approval") {
    return null;
  }
  const taskId = notification.metadata?.task_id;
  const operationId = notification.metadata?.operation_id;
  if (typeof taskId !== "string" || typeof operationId !== "string") {
    return null;
  }
  const triggerId = notification.metadata?.trigger_id;
  const detail = approvalDetail(notification, operationId);
  return {
    operationId,
    riskLevel: detail?.risk_level ?? null,
    taskId,
    title: detail?.title ?? null,
    triggerId: typeof triggerId === "string" ? triggerId : null,
  };
}

/**
 * The per-operation label + risk the run reported, from `payload.approvals`.
 * Older notifications (emitted before the payload carried them) have none — the
 * card then falls back to the bare operation id.
 */
function approvalDetail(
  notification: InboxNotificationDto,
  operationId: string
): { risk_level?: string; title?: string } | null {
  const approvals = notification.payload?.approvals;
  if (!Array.isArray(approvals)) {
    return null;
  }
  const match = approvals.find(
    (entry): entry is { operation_id: string } & Record<string, unknown> =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as { operation_id?: unknown }).operation_id === operationId
  );
  if (!match) {
    return null;
  }
  return {
    ...(typeof match.risk_level === "string"
      ? { risk_level: match.risk_level }
      : {}),
    ...(typeof match.title === "string" ? { title: match.title } : {}),
  };
}

/**
 * The one word that says what this row wants from you. Rendered coloured ahead
 * of the subject so the lane scans as a to-do list ("Review …", "Approve …")
 * rather than a log of things that happened to tasks.
 */
function actionVerbKey(notification: InboxNotificationDto): string | null {
  switch (notification.kind) {
    case "task_failed":
    case "trigger_failed":
      return "inbox.actionFix";
    case "connection_approval_requested":
    case "tool_approval":
      return "inbox.actionApprove";
    case "agent_proposed":
    case "memory_proposal":
    case "skill_proposed":
    case "task_review_requested":
    case "task_completed":
      return "inbox.actionReview";
    default:
      return null;
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
  const failure = isError(notification);
  const Icon = iconForKind(notification);
  const approval = toolApprovalContext(notification);
  // Collapse whitespace so the preview is a clean flowing snippet — no lone
  // blank/"…" lines eating a row.
  const detail = resultText(notification)?.replace(/\s+/g, " ").trim() || null;

  const verbKey = actionVerbKey(notification);
  const summaryNode = (
    <span
      className={cn(
        "font-medium text-sm leading-tight",
        unseen ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {verbKey ? (
        <span
          className={cn(
            "font-semibold",
            failure ? "text-destructive" : "text-primary"
          )}
        >
          {t(verbKey)}{" "}
        </span>
      ) : null}
      {notification.summary}
    </span>
  );

  return (
    <li
      className={cn(
        "ui-canvas-raised flex items-start gap-3 rounded-md bg-card px-4 py-3",
        !unseen && "opacity-70",
        failure && "ring-1 ring-destructive/25"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
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
          <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs leading-snug">
            {detail}
          </p>
        ) : null}
        {approval ? (
          <ToolApprovalActions
            onResolved={() =>
              markMutation.mutate({ action: "dismiss", id: notification.id })
            }
            operationId={approval.operationId}
            riskLevel={approval.riskLevel}
            taskId={approval.taskId}
            title={approval.title}
            triggerId={approval.triggerId}
          />
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
  tone?: "primary" | "destructive";
  onClearAll?: (notifications: InboxNotificationDto[]) => void;
}) {
  const { t } = useTranslation("tasks");
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
      <ul className="flex flex-col gap-2">
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
  grouped = true,
  kindFilter = "all",
  locale,
  notifications,
}: {
  /** When false, render a flat list (e.g. Briefing Attention lane). */
  grouped?: boolean;
  kindFilter?: InboxKindFilter;
  locale: string;
  notifications: InboxNotificationDto[];
}) {
  const { t } = useTranslation("tasks");
  const markMutation = useMarkInboxNotificationMutation();

  const filtered = notifications.filter((n) =>
    matchesInboxKindFilter(n, kindFilter)
  );

  if (filtered.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("inbox.empty")}</p>;
  }

  const hitl = filtered.filter(isHitl);
  const errors = filtered.filter(isError);
  const updates = filtered.filter((n) => !isNeedsInput(n));

  const clearAll = (items: InboxNotificationDto[]) => {
    for (const item of items) {
      markMutation.mutate({ action: "dismiss", id: item.id });
    }
  };

  // Filtered or flat views stay a single lane; grouped "all" keeps sections.
  if (!grouped || kindFilter !== "all") {
    return (
      <TooltipProvider delayDuration={300}>
        <ul className="flex flex-col gap-2">
          {filtered.map((notification) => (
            <InboxItem
              key={notification.id}
              locale={locale}
              notification={notification}
            />
          ))}
        </ul>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6">
        <InboxSection
          icon={ShieldCheck}
          locale={locale}
          notifications={hitl}
          title={t("inbox.needsApproval")}
          tone="primary"
        />
        <InboxSection
          icon={AlertTriangle}
          locale={locale}
          notifications={errors}
          title={t("inbox.errors")}
          tone="destructive"
        />
        <InboxSection
          icon={Link2}
          locale={locale}
          notifications={updates}
          onClearAll={clearAll}
          title={t("inbox.notifications")}
        />
      </div>
    </TooltipProvider>
  );
}
