import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@engenty/ui-core";
import { AnimatedCheckIcon } from "@engenty/ui-icons";
import {
  AlertTriangle,
  AppWindow,
  Bot,
  CheckCheck,
  GitPullRequestArrow,
  MessageCircleQuestion,
  MessagesSquare,
  PencilLine,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link, useParams } from "react-router-dom";
import type { NotificationDto } from "./api.js";
import { isError, isUnseen } from "./classification.js";
import { notificationHref, notificationOrigin } from "./notification-href.js";
import { spaceInboxPath } from "./notification-paths.js";
import { useMarkNotificationMutation } from "./queries.js";
import { NotificationBody, useNotificationRenderer } from "./renderers.js";

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

function humanizeOperationId(operationId: string): string {
  return operationId.replace(OPERATION_ID_SEPARATORS, " ").trim();
}

const OPERATION_ID_SEPARATORS = /[_.]+/g;

/**
 * The line a person reads. Server summaries are English; an approval ask
 * with its origin on the record is composed here in the viewer's language.
 */
function localizedSummary(
  notification: NotificationDto,
  t: (key: string, options: Record<string, unknown>) => string
): string {
  if (
    notification.kind === "approval_requested" ||
    notification.kind === "connection_approval_requested"
  ) {
    const origin = notificationOrigin(notification);
    const operationId = notification.metadata?.operation_id;
    if (origin.actorLabel && typeof operationId === "string") {
      const operation = humanizeOperationId(operationId);
      return origin.spaceName
        ? t("notifications.approval.summary", {
            actor: origin.actorLabel,
            defaultValue: "{{actor}} wants to run {{operation}} in {{space}}",
            operation,
            space: origin.spaceName,
          })
        : t("notifications.approval.summaryGlobal", {
            actor: origin.actorLabel,
            defaultValue: "{{actor}} wants to run {{operation}}",
            operation,
          });
    }
  }
  return notification.summary;
}

/** The agent's result text captured on the payload, if any. */
function resultText(notification: NotificationDto): string | null {
  const raw = notification.payload?.result_text;
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function iconForKind(
  notification: NotificationDto
): ComponentType<{ className?: string }> {
  if (notification.class === "alert") {
    return AlertTriangle;
  }
  switch (notification.kind) {
    case "task_review_requested":
    case "skill_proposed":
    case "routine_review":
      return GitPullRequestArrow;
    case "task_needs_input":
    case "task_question":
    case "action_question":
      return MessageCircleQuestion;
    case "approval_requested":
    case "connection_approval_requested":
    case "tool_approval":
    case "action_gate":
    case "agent_run_suspended":
      return ShieldCheck;
    case "agent_proposed":
    case "agent_hired":
      return Bot;
    case "agent_message_received":
    case "agent_desk_post":
    case "agent_work_completed":
      return MessagesSquare;
    case "records_written":
      return PencilLine;
    case "workflow_proposed":
      return Workflow;
    case "app_release_proposed":
      return AppWindow;
    default:
      return CheckCheck;
  }
}

/**
 * The one word that says what this row wants from you, ahead of the subject
 * so the lane scans as a to-do list rather than a log.
 */
function actionVerb(
  notification: NotificationDto,
  t: (key: string, options: { defaultValue: string }) => string
): string | null {
  if (notification.class === "alert") {
    return t("notifications.action.fix", { defaultValue: "Fix" });
  }
  switch (notification.kind) {
    case "approval_requested":
    case "app_release_proposed":
    case "connection_approval_requested":
    case "tool_approval":
    case "action_gate":
      return t("notifications.action.approve", { defaultValue: "Approve" });
    case "task_needs_input":
    case "task_question":
    case "action_question":
      return t("notifications.action.answer", { defaultValue: "Answer" });
    case "agent_proposed":
    case "workflow_proposed":
    case "skill_proposed":
    case "task_review_requested":
    case "agent_run_suspended":
    case "task_completed":
    case "routine_review":
      return t("notifications.action.review", { defaultValue: "Review" });
    default:
      return null;
  }
}

export function NotificationItem({
  notification,
  locale,
}: {
  notification: NotificationDto;
  locale: string;
}) {
  const { t } = useTranslation("common");
  const { spaceKey } = useParams<{ spaceKey?: string }>();
  const markMutation = useMarkNotificationMutation();
  const unseen = isUnseen(notification);
  const href = notificationHref(notification, spaceKey);
  const failure = isError(notification);
  // A decision with a body that decides it has no "seen": answering is the
  // only way it leaves, so the check would only hide an open gate.
  const renderer = useNotificationRenderer(notification.kind);
  const decidesInPlace = notification.class === "decision" && renderer !== null;
  const origin = notificationOrigin(notification);
  // The space is worth a word only when it is not the one the page already
  // stands in; on the tenant page it links to that space's own inbox.
  const showSpace = origin.spaceKey !== null && origin.spaceKey !== spaceKey;
  const Icon = iconForKind(notification);
  const detail = resultText(notification);
  const verb = actionVerb(notification, t);
  const summaryNode = (
    <span
      className={cn(
        "font-medium text-sm leading-tight",
        unseen ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {verb ? (
        <span
          className={cn(
            "font-semibold",
            failure ? "text-destructive" : "text-primary"
          )}
        >
          {verb}{" "}
        </span>
      ) : null}
      {localizedSummary(notification, t)}
      {notification.coalesced_count > 1 ? (
        <span className="ml-1 text-muted-foreground text-xs tabular-nums">
          ×{notification.coalesced_count}
        </span>
      ) : null}
    </span>
  );
  const markLabel = failure
    ? t("notifications.dismiss", { defaultValue: "Dismiss" })
    : t("notifications.markSeen", { defaultValue: "Mark as seen" });

  return (
    <li
      className={cn(
        "ui-card-raised flex items-start gap-2.5 px-3 py-2",
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
            {origin.actorLabel ? <>{origin.actorLabel} · </> : null}
            {showSpace && origin.spaceKey ? (
              <>
                <Link
                  className="hover:underline"
                  to={spaceInboxPath(origin.spaceKey)}
                >
                  {origin.spaceName ?? origin.spaceKey}
                </Link>
                {" · "}
              </>
            ) : null}
            {relativeTime(notification.created_at, locale)}
          </span>
        </div>
        {detail ? (
          <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs leading-snug">
            {detail}
          </p>
        ) : null}
        <NotificationBody notification={notification} />
      </div>
      {decidesInPlace ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={markLabel}
              className="group h-6 w-6 shrink-0 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
              disabled={markMutation.isPending}
              onClick={() =>
                markMutation.mutate({
                  // Errors are announcements to clear; mark-seen would leave
                  // them in the open inbox forever. HITL / updates stay seen.
                  action: failure ? "dismiss" : "seen",
                  id: notification.id,
                })
              }
              size="icon"
              variant="ghost"
            >
              <AnimatedCheckIcon aria-hidden play="hover" size="sm" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{markLabel}</TooltipContent>
        </Tooltip>
      )}
    </li>
  );
}
