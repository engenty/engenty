import { getFileStorageSignedUrl, MessageResponse } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { queryOptions, useQuery } from "@engenty/query-client";
import {
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
  Bot,
  ChevronDown,
  ChevronRight,
  MessageSquareText,
  Paperclip,
  Pencil,
  Pin,
  SmilePlus,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { TeamChatMessage } from "../api.js";
import { isImageMime } from "../lib/attachments.js";
import {
  authorColorClass,
  authorLabel,
  formatMessageTime,
  mentionTokensToPlainText,
  renderMentionTokens,
  type UsersById,
} from "../lib/format.js";

export interface MessageItemProps {
  canDelete: boolean;
  canEdit: boolean;
  currentUserId: string | null;
  /** Rendered inside an inline thread (compact, no thread affordances). */
  inThread?: boolean;
  message: TeamChatMessage;
  onDelete?: (ts: string) => void;
  onOpenThread?: (ts: string) => void;
  onSaveEdit?: (ts: string, text: string) => Promise<void>;
  onTogglePin?: (ts: string, pinned: boolean) => void;
  onToggleReaction?: (ts: string, emoji: string, active: boolean) => void;
  pinned?: boolean;
  /** Group head renders the author line; followers only the time gutter. */
  showHeader: boolean;
  threadExpanded?: boolean;
  users: UsersById;
}

/**
 * Colored-chip styling for the `#mention:` anchors MessageResponse emits
 * (fragment hrefs — Streamdown's link safety blocks custom protocols).
 * Plain CSS: Tailwind arbitrary variants choke on `:`/`#` inside attribute
 * selectors, so a once-mounted stylesheet targets a stable wrapper class.
 */
const MENTION_CHIP_CSS = `
.team-chat-message button[data-streamdown="link"] {
  border-radius: 4px; padding: 0 4px; font-weight: 500;
  text-decoration: none; cursor: default;
  background: #e0f2fe; color: #075985;
}
.dark .team-chat-message button[data-streamdown="link"] {
  background: rgb(12 74 110 / 0.4); color: #7dd3fc;
}
`;

export function MentionChipStyles() {
  return <style>{MENTION_CHIP_CSS}</style>;
}

interface MessageFile {
  filename?: string;
  mimeType?: string;
  name?: string;
  storageKey?: string;
}

/** Inline image render off the durable storage key (fresh signed URL). */
function AttachmentImage({ file }: { file: MessageFile }) {
  const urlQuery = useQuery(
    queryOptions({
      enabled: Boolean(file.storageKey),
      queryFn: () => getFileStorageSignedUrl(file.storageKey as string),
      queryKey: ["team-chat", "file-url", file.storageKey],
      staleTime: 5 * 60 * 1000,
    })
  );
  if (!urlQuery.data) {
    return (
      <span className="block h-32 w-44 animate-pulse rounded-md bg-muted" />
    );
  }
  return (
    <a href={urlQuery.data} rel="noreferrer" target="_blank">
      <img
        alt={file.filename ?? ""}
        className="max-h-64 max-w-72 rounded-md border border-border/60 object-cover"
        src={urlQuery.data}
      />
    </a>
  );
}

function AttachmentBadges({ message }: { message: TeamChatMessage }) {
  if (message.files.length === 0) {
    return null;
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
      {(message.files as MessageFile[]).map((file, index) =>
        isImageMime(file.mimeType) && file.storageKey ? (
          <AttachmentImage file={file} key={`${message.ts}-file-${index}`} />
        ) : (
          <span
            className="ui-canvas-field inline-flex max-w-56 items-center gap-1 truncate px-2 py-0.5 text-muted-foreground text-xs"
            key={`${message.ts}-file-${index}`}
          >
            <Paperclip className="size-3" />
            {String(file.filename ?? file.name ?? "file")}
          </span>
        )
      )}
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
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {message.reactions.map((reaction) => {
        const active = currentUserId
          ? reaction.users.includes(currentUserId)
          : false;
        return (
          <button
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
              active
                ? "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200"
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
    <div className="flex items-baseline gap-3 px-4 py-0.5">
      <span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground/50 tabular-nums">
        {formatMessageTime(message.ts, locale)}
      </span>
      <span className="min-w-0 flex-1 text-muted-foreground text-xs italic">
        {mentionTokensToPlainText(message.text, users)}
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
  onTogglePin,
  onToggleReaction,
  pinned = false,
  showHeader,
  threadExpanded = false,
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
  const authorId = message.user_id ?? message.agent_type_key ?? "system";
  const isAgent = Boolean(message.agent_type_key);
  const markdown = renderMentionTokens(message.text, users);
  const showThreadBar =
    !inThread && message.reply_count > 0 && Boolean(onOpenThread);
  const aiThreadId = (
    message.metadata as { event_payload?: { ai_thread_id?: string } }
  ).event_payload?.ai_thread_id;

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
        "group relative flex gap-3 rounded-md px-4 transition-colors hover:bg-muted/70 dark:hover:bg-muted/40",
        showHeader ? "mt-2.5 pt-1 pb-1" : "py-1"
      )}
    >
      {/* Timestamp gutter — the per-line indicator (no avatars in-stream). */}
      <span
        className={cn(
          "w-10 shrink-0 select-none pt-[3px] text-right text-[11px] tabular-nums",
          showHeader
            ? "text-muted-foreground/70"
            : "text-muted-foreground/0 group-hover:text-muted-foreground/60"
        )}
      >
        {formatMessageTime(message.ts, locale)}
      </span>

      <div className="min-w-0 flex-1">
        {showHeader ? (
          <div className="mb-0.5 flex items-baseline gap-1.5">
            <span
              className={cn(
                "truncate font-semibold text-sm",
                isAgent
                  ? "text-violet-700 dark:text-violet-300"
                  : authorColorClass(authorId)
              )}
            >
              {author}
            </span>
            {isAgent ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-[3px] bg-violet-100 px-1 py-px text-[10px] text-violet-800 uppercase dark:bg-violet-900/40 dark:text-violet-300">
                <Bot className="size-2.5" /> {t("message.agentBadge")}
              </span>
            ) : null}
            {pinned ? (
              <Pin className="size-3 shrink-0 self-center text-amber-600 dark:text-amber-400" />
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
          <div
            className={cn(
              "team-chat-message text-[0.9rem] text-foreground/90 leading-relaxed",
              "[&_blockquote]:my-1.5 [&_ol]:my-1 [&_p]:my-0.5 [&_pre]:my-1.5 [&_ul]:my-1"
            )}
            onClickCapture={(event) => {
              const target = event.target as HTMLElement;
              const anchor = target.closest?.("a[href^='#mention:']");
              if (anchor) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            <MessageResponse>{markdown}</MessageResponse>
            {message.edited ? (
              <span className="ml-1 text-[11px] text-muted-foreground">
                {t("message.edited")}
              </span>
            ) : null}
          </div>
        )}
        <AttachmentBadges message={message} />

        {aiThreadId ? (
          <Link
            className="mt-0.5 inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
            to={`/mdl/engenty-copilot/chat/${encodeURIComponent(aiThreadId)}`}
          >
            <SquareArrowOutUpRight className="size-3" /> {t("message.viewRun")}
          </Link>
        ) : null}

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
            className="mt-1 flex items-center gap-1.5 rounded-[4px] py-0.5 pr-2 text-xs hover:bg-muted/60"
            onClick={() => onOpenThread?.(message.ts)}
            type="button"
          >
            {threadExpanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )}
            <span className="font-medium text-sky-700 dark:text-sky-300">
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
