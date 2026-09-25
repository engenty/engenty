// One Wichtig record as a card — the space dashboard's attention block. Who
// (the caller's face for the actor), what (the title and one line), and one
// button that goes where it is decided: the task, the chat, the run. ✕
// clears an FYI or an alert.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { NotificationDto } from "./api.js";
import { isDismissible } from "./classification.js";
import { notificationHref, notificationOrigin } from "./notification-href.js";
import {
  actionVerb,
  compactTime,
  localizedSummary,
  NotificationDismissButton,
  notificationBodyText,
} from "./notification-item.js";

export function NotificationAttentionCard({
  face,
  locale,
  notification,
}: {
  /** The actor's face (an agent's), drawn by the host. */
  face?: ReactNode;
  locale: string;
  notification: NotificationDto;
}) {
  const { t } = useTranslation("common");
  const href = notificationHref(notification);
  const origin = notificationOrigin(notification);
  const summary = localizedSummary(notification, t);
  const body = notificationBodyText(notification);
  const verb =
    actionVerb(notification, t) ??
    t("notifications.open", { defaultValue: "Open" });
  return (
    <li className="ui-card-raised flex items-start gap-3 px-3.5 py-3">
      {face ? <span className="shrink-0 pt-0.5">{face}</span> : null}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="truncate text-muted-foreground text-xs">
            {origin.actorLabel}
          </p>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-muted-foreground text-xs tabular-nums">
              {compactTime(notification.created_at, locale)}
            </span>
            {isDismissible(notification) ? (
              <NotificationDismissButton notification={notification} />
            ) : null}
          </span>
        </div>
        <p
          className={cn(
            "mt-0.5 line-clamp-2 font-medium text-sm leading-snug",
            notification.class === "alert" && "text-destructive"
          )}
        >
          {summary}
        </p>
        {body ? (
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {body}
          </p>
        ) : null}
        {href ? (
          <Button
            asChild
            className="mt-2 h-7 rounded-full px-3 text-xs"
            size="sm"
            variant={notification.class === "decision" ? "secondary" : "ghost"}
          >
            <Link to={href}>{verb}</Link>
          </Button>
        ) : null}
      </div>
    </li>
  );
}
