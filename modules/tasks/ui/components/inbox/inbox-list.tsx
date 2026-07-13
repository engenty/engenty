// Inbox entries (Mastra notification records) — shared by the inbox page and
// the Briefing section. Unseen entries are highlighted; seen ones stay listed
// until dismissed.
import {
  type InboxNotificationDto,
  useMarkInboxNotificationMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { AlertTriangle, Check, CheckCheck, X } from "lucide-react";
import { Link } from "react-router-dom";
import { tasksPaths } from "../../lib/tasks-routes.js";

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

  return (
    <ul className="space-y-2">
      {notifications.map((notification) => {
        const unseen = isUnseen(notification);
        const href = notificationHref(notification);
        const failure =
          notification.kind === "task_failed" ||
          notification.kind === "trigger_failed";
        const summary = (
          <span
            className={cn(
              "text-sm leading-snug",
              unseen ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {notification.summary}
          </span>
        );
        return (
          <li
            className={cn(
              "ui-canvas-raised flex items-start gap-3 rounded-md p-3",
              unseen ? "bg-card" : "bg-muted/30"
            )}
            key={notification.id}
          >
            {failure ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            ) : (
              <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              {href ? (
                <Link className="block hover:underline" to={href}>
                  {summary}
                </Link>
              ) : (
                summary
              )}
              <p className="text-muted-foreground text-xs tabular-nums">
                {relativeTime(notification.createdAt, locale)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {unseen && (
                <Button
                  aria-label={t("inbox.markSeen")}
                  className="h-7 w-7"
                  disabled={markMutation.isPending}
                  onClick={() =>
                    markMutation.mutate({
                      action: "seen",
                      id: notification.id,
                    })
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
                  markMutation.mutate({
                    action: "dismiss",
                    id: notification.id,
                  })
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
      })}
    </ul>
  );
}
