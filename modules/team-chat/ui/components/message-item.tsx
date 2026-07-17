import { MessageResponse } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  AvatarStack,
  Button,
  cn,
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
} from "@engenty/ui-core";
import {
  MessageSquareText,
  Pencil,
  Pin,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
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
  canEdit: boolean;
  currentUserId: string | null;
  /** Hide the reply-summary bar when rendering inside the thread panel. */
  inThread?: boolean;
  message: TeamChatMessage;
  onDelete?: (ts: string) => void;
  onOpenThread?: (ts: string) => void;
  onSaveEdit?: (ts: string, text: string) => Promise<void>;
  onTogglePin?: (ts: string, pinned: boolean) => void;
  onToggleReaction?: (ts: string, emoji: string, active: boolean) => void;
  pinned?: boolean;
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

function ReactionPills({
  currentUserId,
  message,
  onPick,
  onToggleReaction,
}: {
  currentUserId: string | null;
  message: TeamChatMessage;
  onPick: React.ReactNode;
  onToggleReaction?: (ts: string, emoji: string, active: boolean) => void;
}) {
  if (message.reactions.length === 0) {
    return null;
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {message.reactions.map((reaction) => {
        const active = currentUserId
          ? reaction.users.includes(currentUserId)
          : false;
        return (
          <button
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border/60 bg-card text-muted-foreground hover:border-border"
            )}
            key={reaction.name}
            onClick={() =>
              onToggleReaction?.(message.ts, reaction.name, active)
            }
            type="button"
          >
            <span>{reaction.name}</span>
            <span className="tabular-nums">{reaction.count}</span>
          </button>
        );
      })}
      {onPick}
    </div>
  );
}

function EmojiPickerPopover({
  children,
  onSelect,
}: {
  children: React.ReactNode;
  onSelect: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-fit p-0">
        <EmojiPicker
          className="h-[300px]"
          onEmojiSelect={({ emoji }) => {
            setOpen(false);
            onSelect(emoji);
          }}
        >
          <EmojiPickerSearch />
          <EmojiPickerContent />
        </EmojiPicker>
      </PopoverContent>
    </Popover>
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
  canEdit,
  currentUserId,
  inThread = false,
  message,
  onDelete,
  onOpenThread,
  onSaveEdit,
  onToggleReaction,
  onTogglePin,
  pinned = false,
  showHeader,
  users,
}: MessageItemProps) {
  const { t, i18n } = useTranslation("team-chat");
  const locale = i18n.language;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (message.subtype) {
    return <SystemMessageRow locale={locale} message={message} users={users} />;
  }

  const author = authorLabel(message, users);
  const markdown = renderMentionTokens(message.text, users);
  const showThreadBar =
    !inThread && message.reply_count > 0 && Boolean(onOpenThread);

  const startEdit = () => {
    setDraft(message.text);
    setEditing(true);
  };
  const saveEdit = async () => {
    const value = draft.trim();
    if (value && value !== message.text && onSaveEdit) {
      await onSaveEdit(message.ts, value);
    }
    setEditing(false);
  };

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
            {pinned ? (
              <Pin className="size-3 shrink-0 text-muted-foreground" />
            ) : null}
          </div>
        ) : null}

        {editing ? (
          <div className="my-1 flex flex-col gap-1">
            <Textarea
              autoFocus
              className="min-h-9"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void saveEdit();
                }
                if (event.key === "Escape") {
                  setEditing(false);
                }
              }}
              value={draft}
            />
            <span className="text-[11px] text-muted-foreground">
              {t("message.editHint")}
            </span>
          </div>
        ) : (
          <div className="text-sm">
            <MessageResponse>{markdown}</MessageResponse>
            {message.edited ? (
              <span className="ml-1 text-muted-foreground text-xs">
                {t("message.edited")}
              </span>
            ) : null}
          </div>
        )}
        <AttachmentBadges message={message} />

        <ReactionPills
          currentUserId={currentUserId}
          message={message}
          onPick={
            onToggleReaction ? (
              <EmojiPickerPopover
                onSelect={(emoji) => onToggleReaction(message.ts, emoji, false)}
              >
                <button
                  aria-label={t("message.react")}
                  className="inline-flex items-center rounded-full border border-border/60 border-dashed px-1.5 py-0.5 text-muted-foreground text-xs hover:border-border"
                  type="button"
                >
                  <SmilePlus className="size-3.5" />
                </button>
              </EmojiPickerPopover>
            ) : null
          }
          onToggleReaction={onToggleReaction}
        />

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
        {onToggleReaction ? (
          <EmojiPickerPopover
            onSelect={(emoji) => onToggleReaction(message.ts, emoji, false)}
          >
            <Button
              aria-label={t("message.react")}
              size="icon-sm"
              variant="ghost"
            >
              <SmilePlus className="size-3.5" />
            </Button>
          </EmojiPickerPopover>
        ) : null}
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
        {onTogglePin && !inThread ? (
          <Button
            aria-label={pinned ? t("message.unpin") : t("message.pin")}
            onClick={() => onTogglePin(message.ts, pinned)}
            size="icon-sm"
            variant="ghost"
          >
            <Pin className={cn("size-3.5", pinned && "fill-current")} />
          </Button>
        ) : null}
        {canEdit && onSaveEdit ? (
          <Button
            aria-label={t("message.edit")}
            onClick={startEdit}
            size="icon-sm"
            variant="ghost"
          >
            <Pencil className="size-3.5" />
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
