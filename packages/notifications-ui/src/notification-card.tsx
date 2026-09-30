// One record as a card, read like a macOS notification: who (face + name),
// what (title), one line under it. The card opens the agent's context — the
// conversation, the run, the task (`target`); a result the work produced
// opens from its own chip (`attachments`); a record that wants a person
// carries one verb button that goes where it is decided.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { Check, ChevronRight, FileText, Paperclip, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { NotificationDto } from "./api.js";
import { canMarkSeen, isUnseen } from "./classification.js";
import {
  NotificationFace,
  useNotificationActorName,
} from "./notification-face.js";
import { notificationHref, notificationOrigin } from "./notification-href.js";
import {
  actionVerb,
  compactTime,
  localizedSummary,
  notificationBodyText,
} from "./notification-text.js";
import { useMarkNotificationMutation } from "./queries.js";
import { NotificationBody } from "./renderers.js";

export type NotificationCardVariant = "list" | "banner" | "page";

export interface NotificationCardProps {
  locale: string;
  notification: NotificationDto;
  /**
   * Replaces opening the context — a collapsed stack expands instead. The
   * chips and the verb still go where they go.
   */
  onActivate?: () => void;
  /** A banner's ✕ closes the banner, not the record. */
  onClose?: () => void;
  /** After any link on the card is followed (close the popover / banner). */
  onNavigate?: () => void;
  /** Name the space: the viewer stands somewhere else. */
  showSpace?: boolean;
  variant?: NotificationCardVariant;
}

export function NotificationCard({
  locale,
  notification,
  onActivate,
  onClose,
  onNavigate,
  showSpace = false,
  variant = "list",
}: NotificationCardProps) {
  const { t } = useTranslation("common");
  const mark = useMarkNotificationMutation();
  const href = notificationHref(notification);
  const origin = notificationOrigin(notification);
  const unseen = isUnseen(notification);
  const alert = notification.class === "alert";
  const actorName = useNotificationActorName(notification);
  const title = localizedSummary(notification, t, actorName);
  const body = notificationBodyText(notification);
  const verb = actionVerb(notification, t);
  const attachments = notification.attachments ?? [];
  const markable = variant !== "banner" && canMarkSeen(notification);
  const who =
    actorName ??
    origin.spaceName ??
    t("notifications.fromEngenty", { defaultValue: "Engenty" });
  const where =
    showSpace && origin.spaceName && origin.spaceName !== who
      ? origin.spaceName
      : null;

  // Following any link on the card is reading it — except a decision, which
  // stays until it is answered at its source.
  const opened = () => {
    if (unseen && notification.class !== "decision") {
      mark.mutate({ action: "seen", id: notification.id });
    }
    onNavigate?.();
  };
  const closeLabel = t("notifications.close", { defaultValue: "Close" });
  const markSeenLabel = t("notifications.markSeen", {
    defaultValue: "Mark as seen",
  });
  // On hover, like macOS's actions: bottom right — at the end of the body
  // line, or of the one line when there is no body.
  const markSeenButton = markable ? (
    <Button
      aria-label={markSeenLabel}
      className="pointer-events-auto -my-0.5 hidden h-5 shrink-0 gap-1 px-1.5 text-muted-foreground text-xs hover:text-foreground group-hover/card:inline-flex"
      disabled={mark.isPending}
      onClick={() => mark.mutate({ action: "seen", id: notification.id })}
      size="sm"
      title={markSeenLabel}
      variant="ghost"
    >
      <Check aria-hidden className="size-3.5" />
      <span className="hidden sm:inline">{markSeenLabel}</span>
    </Button>
  ) : null;

  // The whole card is the context link; everything interactive sits above it.
  const cover = onActivate ? (
    <button
      aria-label={title}
      className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-ring"
      onClick={onActivate}
      type="button"
    />
  ) : href ? (
    <Link
      aria-label={title}
      className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-ring"
      onClick={opened}
      to={href}
    />
  ) : null;

  return (
    <article
      className={cn(
        "group/card relative flex items-start gap-2.5 px-3 py-2 text-left",
        variant === "banner"
          ? "ui-canvas-floating rounded-xl"
          : "ui-card-raised",
        cover && variant !== "banner" && "ui-card-interactive",
        cover && "cursor-pointer"
      )}
      data-notification-id={notification.id}
    >
      {cover}
      {variant === "banner" && onClose ? (
        <Button
          aria-label={closeLabel}
          className="ui-canvas-floating absolute -top-2 -left-2 z-10 size-5 rounded-full text-muted-foreground hover:text-foreground"
          onClick={onClose}
          size="icon-sm"
          title={closeLabel}
          variant="ghost"
        >
          <X aria-hidden className="size-3" />
        </Button>
      ) : null}
      <span className="pointer-events-none relative shrink-0">
        <NotificationFace notification={notification} size={24} />
      </span>
      <div className="pointer-events-none relative min-w-0 flex-1">
        <div className="flex h-6 min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">{who}</span>
            <span
              className={cn(
                "ml-2",
                alert ? "text-destructive" : "text-foreground"
              )}
            >
              {title}
            </span>
            {notification.coalesced_count > 1 ? (
              <span className="ml-1 text-muted-foreground text-xs tabular-nums">
                ×{notification.coalesced_count}
              </span>
            ) : null}
          </p>
          {where ? (
            <span className="max-w-32 shrink-0 truncate text-muted-foreground text-xs">
              {where}
            </span>
          ) : null}
          {/* Like macOS: on hover the whole right side — result, verb, dot,
              time — gives way to the way into the context. */}
          <div
            className={cn(
              "flex shrink-0 items-center gap-2",
              cover && "group-hover/card:hidden"
            )}
          >
            {attachments.length > 0 || (verb && href) ? (
              <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
                {attachments.map((attachment) => (
                  <Button
                    asChild
                    className="h-6 max-w-40 gap-1 rounded-full px-2 text-xs"
                    key={attachment.target}
                    size="sm"
                    variant="outline"
                  >
                    <Link onClick={opened} to={attachment.target}>
                      {attachment.kind === "artifact" ? (
                        <FileText aria-hidden className="size-3 shrink-0" />
                      ) : (
                        <Paperclip aria-hidden className="size-3 shrink-0" />
                      )}
                      <span className="truncate">{attachment.label}</span>
                    </Link>
                  </Button>
                ))}
                {verb && href ? (
                  <Button
                    asChild
                    className="h-6 rounded-full px-2.5 text-xs"
                    size="sm"
                    variant={
                      notification.class === "decision"
                        ? "default"
                        : "secondary"
                    }
                  >
                    <Link onClick={opened} to={href}>
                      {verb}
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
            {unseen && variant !== "banner" ? (
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-primary"
              />
            ) : null}
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {compactTime(notification.created_at, locale)}
            </span>
          </div>
          {body ? null : markSeenButton}
          {cover ? (
            <span className="hidden shrink-0 items-center gap-0.5 text-muted-foreground text-xs group-hover/card:inline-flex">
              {t("notifications.showMore", { defaultValue: "Show more" })}
              <ChevronRight aria-hidden className="size-3.5" />
            </span>
          ) : null}
        </div>
        {body ? (
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
              {body}
            </p>
            {markSeenButton}
          </div>
        ) : null}
        {variant === "page" ? (
          <div className="pointer-events-auto">
            <NotificationBody notification={notification} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
