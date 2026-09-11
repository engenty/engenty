import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, ScrollArea, Separator } from "@engenty/ui-core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TeamChatMessage } from "../api.js";
import {
  dayKey,
  formatDayLabel,
  sameGroup,
  type UsersById,
} from "../lib/format.js";
import { MentionChipStyles, MessageItem } from "./message-item.js";

export interface MessageListProps {
  /**
   * `ts` of a message to scroll to and flash on mount (deep link from the
   * dashboard). Falls back to the newest message when it isn't loaded.
   */
  anchorTs?: string | null;
  canDelete: (message: TeamChatMessage) => boolean;
  canEdit: (message: TeamChatMessage) => boolean;
  currentUserId: string | null;
  emptyState?: React.ReactNode;
  hasMore?: boolean;
  inThread?: boolean;
  /** Chronological (oldest → newest). */
  messages: TeamChatMessage[];
  onDelete?: (ts: string) => void;
  onLoadOlder?: () => void;
  onOpenThread?: (ts: string) => void;
  onSaveEdit?: (ts: string, text: string) => Promise<void>;
  onTogglePin?: (ts: string, pinned: boolean) => void;
  onToggleReaction?: (ts: string, emoji: string, active: boolean) => void;
  pinnedTs?: ReadonlySet<string>;
  /** Renders the inline thread body under an expanded root message. */
  renderThread?: (threadTs: string) => React.ReactNode;
  users: UsersById;
  /**
   * Roots whose inline thread (replies + reply composer) is currently visible.
   * Drives both the render gate and the expand/collapse chevron — a root can be
   * here with zero replies (a thread the user just opened to start replying).
   */
  visibleThreads?: ReadonlySet<string>;
}

export function MessageList({
  anchorTs,
  canDelete,
  canEdit,
  visibleThreads,
  currentUserId,
  renderThread,
  emptyState,
  hasMore,
  inThread = false,
  messages,
  onDelete,
  onLoadOlder,
  onOpenThread,
  onSaveEdit,
  onToggleReaction,
  onTogglePin,
  pinnedTs,
  users,
}: MessageListProps) {
  const { t, i18n } = useTranslation("team-chat");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastTs = messages.at(-1)?.ts;
  // The anchor wins exactly once (until it changes); afterwards the list
  // resumes following the newest message.
  const [flashTs, setFlashTs] = useState<string | null>(null);
  const consumedAnchor = useRef<string | null>(null);

  useEffect(() => {
    if (anchorTs && consumedAnchor.current !== anchorTs) {
      const target = document.getElementById(`tc-msg-${anchorTs}`);
      if (target) {
        consumedAnchor.current = anchorTs;
        target.scrollIntoView({ block: "center" });
        setFlashTs(anchorTs);
        return;
      }
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastTs, anchorTs]);

  // Owns the fade so a list refetch inside the window can't cancel the timer
  // and leave the highlight stuck.
  useEffect(() => {
    if (!flashTs) {
      return;
    }
    const timer = setTimeout(() => setFlashTs(null), 3500);
    return () => clearTimeout(timer);
  }, [flashTs]);

  const rows = useMemo(() => {
    const result: {
      dayLabel: string | null;
      message: TeamChatMessage;
      showHeader: boolean;
    }[] = [];
    for (const [index, message] of messages.entries()) {
      const previous = messages[index - 1];
      const newDay = !previous || dayKey(previous.ts) !== dayKey(message.ts);
      result.push({
        dayLabel: newDay ? formatDayLabel(message.ts, i18n.language) : null,
        message,
        showHeader: newDay || !sameGroup(previous, message),
      });
    }
    return result;
  }, [messages, i18n.language]);

  if (messages.length === 0 && emptyState) {
    return <div className="flex flex-1 items-center">{emptyState}</div>;
  }

  return (
    <>
      <MentionChipStyles />
      <ScrollArea className="min-h-0 flex-1">
        {/* Reading column: full-width surfaces cap the stream at the same
            width as the page headers (no-op inside narrower embeds). */}
        <div className="mx-auto flex w-full max-w-5xl flex-col pb-3">
          {hasMore && onLoadOlder ? (
            <div className="flex justify-center py-2">
              <Button onClick={onLoadOlder} size="sm" variant="ghost">
                {t("conversation.loadOlder")}
              </Button>
            </div>
          ) : null}
          {rows.map(({ dayLabel, message, showHeader }) => (
            <div
              className={cn(
                "rounded-md transition-colors duration-1000",
                flashTs === message.ts && "bg-amber-200/60 dark:bg-amber-400/15"
              )}
              id={`tc-msg-${message.ts}`}
              key={`${message.ts}${message.deleted ? "-deleted" : ""}`}
            >
              {dayLabel ? (
                <div className="relative my-3 flex items-center px-4">
                  <Separator className="flex-1" />
                  <span className="mx-3 shrink-0 rounded-full border border-border-soft bg-card px-3 py-0.5 font-medium text-muted-foreground text-xs">
                    {dayLabel}
                  </span>
                  <Separator className="flex-1" />
                </div>
              ) : null}
              <MessageItem
                canDelete={canDelete(message)}
                canEdit={canEdit(message)}
                currentUserId={currentUserId}
                inThread={inThread}
                message={message}
                onDelete={onDelete}
                onOpenThread={onOpenThread}
                onSaveEdit={onSaveEdit}
                onTogglePin={onTogglePin}
                onToggleReaction={onToggleReaction}
                pinned={pinnedTs?.has(message.ts) ?? false}
                showHeader={showHeader}
                threadExpanded={visibleThreads?.has(message.ts) ?? false}
                users={users}
              />
              {visibleThreads?.has(message.ts) && renderThread
                ? renderThread(message.ts)
                : null}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </>
  );
}
