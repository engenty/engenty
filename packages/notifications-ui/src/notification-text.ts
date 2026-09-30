// What a record says, in words and one glyph: the title in the viewer's
// language, the one line under it, the verb its button carries, a short
// time. Shared by the card, the banner and the OS channels.
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
} from "lucide-react";
import type { ComponentType } from "react";
import type { NotificationDto } from "./api.js";

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

export function relativeTime(iso: string, locale: string): string {
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
 *
 * Given `actorName`, the caller shows that name above the title, so the
 * title leaves it out ("Has a question", not "Offers Manager has a
 * question") — `notifications.headlines.<key>`, else the full title.
 */
export function localizedSummary(
  notification: NotificationDto,
  t: Translate,
  /** The agent's display name, shown above the title by the caller. */
  actorName?: string | null
): string {
  if (!notification.title_key) {
    return notification.summary;
  }
  const params = {
    ...(notification.title_params ?? {}),
    ...(actorName && notification.title_params?.actor
      ? { actor: actorName }
      : {}),
  };
  const title = t(`notifications.titles.${notification.title_key}`, {
    ...params,
    defaultValue: notification.summary,
  });
  if (!actorName) {
    return title;
  }
  return t(`notifications.headlines.${notification.title_key}`, {
    ...params,
    defaultValue: title,
  });
}

/** The one plain line under the title, as the server stored it. */
export function notificationBodyText(
  notification: NotificationDto
): string | null {
  return notification.body?.trim() ? notification.body : null;
}

export function iconForKind(
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
