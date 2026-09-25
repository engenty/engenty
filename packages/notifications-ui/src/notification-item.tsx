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
  Bell,
  Bot,
  CheckCheck,
  Flag,
  GitPullRequestArrow,
  MessageCircleQuestion,
  MessagesSquare,
  PencilLine,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { NotificationDto } from "./api.js";
import { isDismissible, isError, isUnseen } from "./classification.js";
import { notificationHref, notificationOrigin } from "./notification-href.js";
import { spaceInboxPath, spaceKeyFromPathname } from "./notification-paths.js";
import { useMarkNotificationMutation } from "./queries.js";
import { NotificationBody, useNotificationRenderer } from "./renderers.js";

export function compactTime(iso: string, locale: string): string {
  const then = new Date(iso);
  const thenMs = then.getTime();
  if (!Number.isFinite(thenMs)) {
    return "";
  }
  const deltaMinutes = Math.round((thenMs - Date.now()) / 60_000);
  const absMinutes = Math.abs(deltaMinutes);
  if (absMinutes < 1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
      0,
      "second"
    );
  }
  if (absMinutes < 60) {
    return `${absMinutes}m`;
  }
  const absHours = Math.round(absMinutes / 60);
  if (absHours < 24) {
    return `${absHours}h`;
  }
  const absDays = Math.round(absHours / 24);
  if (absDays < 7) {
    return `${absDays}d`;
  }
  return then.toLocaleDateString(locale, { day: "numeric", month: "short" });
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

type Translate = (key: string, options: Record<string, unknown>) => string;

/**
 * The title a person reads, in their language. The server stores a key and
 * the names it uses (`title_key`, `title_params`); without one (a producer
 * missing a name) the server's English `summary` is the title.
 */
export function localizedSummary(
  notification: NotificationDto,
  t: Translate
): string {
  if (notification.title_key) {
    return t(`notifications.titles.${notification.title_key}`, {
      ...(notification.title_params ?? {}),
      defaultValue: notification.summary,
    });
  }
  return notification.summary;
}

/** The one plain line under the title, as the server stored it. */
export function notificationBodyText(
  notification: NotificationDto
): string | null {
  return notification.body?.trim() ? notification.body : null;
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
    case "routine_outcome":
      return notification.priority === "high" ||
        notification.priority === "urgent"
        ? Bell
        : Flag;
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
export function actionVerb(
  notification: NotificationDto,
  t: (key: string, options: { defaultValue: string }) => string
): string | null {
  if (notification.class === "alert") {
    return t("notifications.action.fix", { defaultValue: "Fix" });
  }
  switch (notification.kind) {
    case "approval_requested":
    case "app_release_proposed":
    case "tool_approval":
    case "action_gate":
      return t("notifications.action.approve", { defaultValue: "Approve" });
    case "task_needs_input":
    case "task_question":
    case "action_question":
    case "agent_question":
      return t("notifications.action.answer", { defaultValue: "Answer" });
    case "room_paused":
      return t("notifications.action.continue", { defaultValue: "Continue" });
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

/** ✕ — closes an alert or an attention FYI for everyone (the dismiss route). */
export function NotificationDismissButton({
  notification,
}: {
  notification: NotificationDto;
}) {
  const { t } = useTranslation("common");
  const markMutation = useMarkNotificationMutation();
  const label = t("notifications.dismiss", { defaultValue: "Dismiss" });
  return (
    <Button
      aria-label={label}
      className="size-5 shrink-0 text-muted-foreground"
      disabled={markMutation.isPending}
      onClick={() =>
        markMutation.mutate({ action: "dismiss", id: notification.id })
      }
      size="icon-sm"
      title={label}
      variant="ghost"
    >
      <X aria-hidden className="size-3" />
    </Button>
  );
}

export function NotificationItem({
  notification,
  locale,
  variant = "page",
}: {
  notification: NotificationDto;
  locale: string;
  variant?: "page" | "inbox";
}) {
  const { t } = useTranslation("common");
  // The bell sits in the app rail, outside `/s/:spaceKey`: read the space
  // the viewer stands in from the path when the route has no param.
  const { spaceKey: paramSpaceKey } = useParams<{ spaceKey?: string }>();
  const { pathname } = useLocation();
  const spaceKey = paramSpaceKey ?? spaceKeyFromPathname(pathname);
  const markMutation = useMarkNotificationMutation();
  const unseen = isUnseen(notification);
  const href = notificationHref(notification);
  const failure = isError(notification);
  const renderer = useNotificationRenderer(notification.kind);
  const inbox = variant === "inbox";
  // The bell is a pointer: a decision is made where it lives (the task, the
  // chat, the run), so the row carries one button that goes there. The full
  // page still shows a module's own body for its kind.
  const decidesInPlace =
    !inbox && notification.class === "decision" && renderer !== null;
  const origin = notificationOrigin(notification);
  // The space is worth a word only when it is not the one the page already
  // stands in.
  const showSpace = origin.spaceKey !== null && origin.spaceKey !== spaceKey;
  const Icon = iconForKind(notification);
  const verb = actionVerb(notification, t);
  const title = localizedSummary(notification, t);
  const body = notificationBodyText(notification);
  const sourceParts = [
    showSpace ? (origin.spaceName ?? origin.spaceKey) : null,
    origin.actorLabel,
  ].filter((part): part is string => Boolean(part));
  // An alert or an attention FYI is cleared, not glanced at: seen would leave
  // it open (and on the bell) forever.
  const dismissible = isDismissible(notification);
  const markLabel = dismissible
    ? t("notifications.dismiss", { defaultValue: "Dismiss" })
    : t("notifications.markSeen", { defaultValue: "Mark as seen" });
  // Following the link to an FYI is reading it; a decision stays until it
  // is answered at its source.
  const onOpen = () => {
    if (unseen && notification.class !== "decision") {
      markMutation.mutate({ action: "seen", id: notification.id });
    }
  };
  const showMark = !(inbox || decidesInPlace);
  const markButton = showMark ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={markLabel}
          className="group h-6 w-6 shrink-0 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
          disabled={markMutation.isPending}
          onClick={() =>
            markMutation.mutate({
              action: dismissible ? "dismiss" : "seen",
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
  ) : null;
  const timeCue = (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="text-muted-foreground text-xs tabular-nums">
        {inbox
          ? compactTime(notification.created_at, locale)
          : relativeTime(notification.created_at, locale)}
      </span>
      {unseen ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-primary"
        />
      ) : null}
      {inbox && dismissible ? (
        <NotificationDismissButton notification={notification} />
      ) : null}
    </span>
  );
  const titleNode = (
    <span
      className={cn(
        "line-clamp-2 text-sm leading-snug",
        unseen || notification.class === "decision"
          ? "font-semibold text-foreground"
          : "text-muted-foreground",
        failure && "text-destructive"
      )}
    >
      {title}
      {notification.coalesced_count > 1 ? (
        <span className="ml-1 font-normal text-muted-foreground text-xs tabular-nums">
          ×{notification.coalesced_count}
        </span>
      ) : null}
    </span>
  );
  // One button that says what the row wants and goes where it is done.
  const cta =
    href && verb ? (
      <Button
        asChild
        className="h-7 shrink-0 rounded-full px-3 text-xs"
        size="sm"
        variant={notification.class === "decision" ? "secondary" : "ghost"}
      >
        <Link onClick={onOpen} to={href}>
          {verb}
        </Link>
      </Button>
    ) : null;

  return (
    <li
      className={cn(
        "group/notification flex items-start",
        inbox
          ? "ui-row-hover gap-3 px-4 py-3 [&_a]:no-underline"
          : "ui-card-raised gap-2.5 px-3 py-2.5",
        !(inbox || unseen) && "opacity-70",
        !inbox && failure && "ring-1 ring-destructive/25"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          failure ? "text-destructive" : "text-muted-foreground"
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="min-w-0 truncate text-muted-foreground text-xs">
            {sourceParts.length > 0 ? (
              showSpace && origin.spaceKey ? (
                <>
                  <Link
                    className="hover:underline"
                    to={spaceInboxPath(origin.spaceKey)}
                  >
                    {sourceParts[0]}
                  </Link>
                  {sourceParts.length > 1 ? ` · ${sourceParts[1]}` : null}
                </>
              ) : (
                sourceParts.join(" · ")
              )
            ) : null}
          </p>
          {timeCue}
        </div>
        <div className="mt-0.5 flex min-w-0 items-end justify-between gap-3">
          <div className="min-w-0">
            {href ? (
              <Link
                className="block min-w-0 no-underline"
                onClick={onOpen}
                to={href}
              >
                {titleNode}
              </Link>
            ) : (
              titleNode
            )}
            {body ? (
              <p className="mt-0.5 truncate text-muted-foreground text-xs leading-snug">
                {body}
              </p>
            ) : null}
          </div>
          {cta}
        </div>
        {inbox ? null : <NotificationBody notification={notification} />}
      </div>
      {inbox ? null : markButton}
    </li>
  );
}
