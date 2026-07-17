import { MessageResponse } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  AvatarStack,
  Button,
  cn,
} from "@engenty/ui-core";
import { MessageSquareText, Trash2 } from "lucide-react";
import type { TeamChatMessage } from "../api.js";
import {
  authorInitials,
  authorLabel,
  formatMessageTime,
  renderMentionTokens,
  type UsersById,
  userLabel,
} from "../lib/format.js";

export interface MessageItemProps {
  canDelete: boolean;
  /** Hide the reply-summary bar when rendering inside the thread panel. */
  inThread?: boolean;
  message: TeamChatMessage;
  onDelete?: (ts: string) => void;
  onOpenThread?: (ts: string) => void;
  /** Group head renders avatar + author + time; followers only hover-time. */
  showHeader: boolean;
  users: UsersById;
}

function AttachmentBadges({ message }: { message: TeamChatMessage }) {
  if (message.files.length === 0) {
    return null;
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {message.files.map((file, index) => (
        <span
          className="ui-canvas-field inline-flex max-w-56 items-center gap-1 truncate px-2 py-0.5 text-muted-foreground text-xs"
          key={`${message.ts}-file-${index}`}
        >
          {String(
            (file as { filename?: string; name?: string }).filename ??
              (file as { name?: string }).name ??
              "file"
          )}
        </span>
      ))}
    </div>
  );
}

/** Compact single-line rendering for subtype/system messages. */
function SystemMessageRow({
  locale,
  message,
  users,
}: {
  locale: string;
  message: TeamChatMessage;
  users: UsersById;
}) {
  return (
    <div className="flex items-baseline gap-2 px-11 py-0.5 text-muted-foreground text-xs">
      <span className="min-w-0 flex-1">
        {renderMentionTokens(message.text, users).replace(/\*\*/g, "")}
      </span>
      <span className="shrink-0 tabular-nums">
        {formatMessageTime(message.ts, locale)}
      </span>
    </div>
  );
}

export function MessageItem({
  canDelete,
  inThread = false,
  message,
  onDelete,
  onOpenThread,
  showHeader,
  users,
}: MessageItemProps) {
  const { t, i18n } = useTranslation("team-chat");
  const locale = i18n.language;

  if (message.subtype) {
    return <SystemMessageRow locale={locale} message={message} users={users} />;
  }

  const author = authorLabel(message, users);
  const markdown = renderMentionTokens(message.text, users);
  const showThreadBar =
    !inThread && message.reply_count > 0 && Boolean(onOpenThread);

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4 py-0.5 hover:bg-muted/40",
        showHeader && "mt-2 pt-1"
      )}
    >
      {showHeader ? (
        <Avatar className="mt-0.5 size-8 shrink-0">
          <AvatarFallback className="text-xs">
            {authorInitials(author)}
          </AvatarFallback>
        </Avatar>
      ) : (
        <span className="w-8 shrink-0 select-none text-right text-[10px] text-muted-foreground/0 tabular-nums group-hover:text-muted-foreground/70">
          {formatMessageTime(message.ts, locale)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        {showHeader ? (
          <div className="flex items-baseline gap-2">
            <span className="truncate font-semibold text-sm">{author}</span>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {formatMessageTime(message.ts, locale)}
            </span>
          </div>
        ) : null}

        <div className="text-sm">
          <MessageResponse>{markdown}</MessageResponse>
          {message.edited ? (
            <span className="ml-1 text-muted-foreground text-xs">
              {t("message.edited")}
            </span>
          ) : null}
        </div>
        <AttachmentBadges message={message} />

        {showThreadBar ? (
          <button
            className="mt-1 flex items-center gap-2 rounded-[4px] px-1.5 py-1 text-xs hover:bg-muted/60"
            onClick={() => onOpenThread?.(message.ts)}
            type="button"
          >
            <AvatarStack
              max={3}
              profiles={message.reply_users.slice(0, 3).map((id) => ({
                full_name: userLabel(users.get(id), id.slice(0, 8)),
                id,
              }))}
              size="sm"
            />
            <span className="font-medium text-primary">
              {t("thread.replyCount", { count: message.reply_count })}
            </span>
          </button>
        ) : null}
      </div>

      <div className="absolute top-0 right-3 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-border/60 bg-card p-0.5 shadow-[var(--e-1)] group-hover:flex">
        {onOpenThread && !inThread ? (
          <Button
            aria-label={t("thread.openThread")}
            onClick={() => onOpenThread(message.ts)}
            size="icon-sm"
            variant="ghost"
          >
            <MessageSquareText className="size-3.5" />
          </Button>
        ) : null}
        {canDelete && onDelete ? (
          <Button
            aria-label={t("message.delete")}
            onClick={() => onDelete(message.ts)}
            size="icon-sm"
            variant="ghost"
          >
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
