import { useTranslation } from "@engenty/i18n/ui";
import { Button, ScrollArea, Separator } from "@engenty/ui-core";
import { useEffect, useMemo, useRef } from "react";
import type { TeamChatMessage } from "../api.js";
import {
  dayKey,
  formatDayLabel,
  sameGroup,
  type UsersById,
} from "../lib/format.js";
import { MessageItem } from "./message-item.js";

export interface MessageListProps {
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
  users: UsersById;
}

export function MessageList({
  canDelete,
  canEdit,
  currentUserId,
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

  // Keep the view pinned to the newest message when new ones arrive.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastTs]);

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
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col pb-3">
        {hasMore && onLoadOlder ? (
          <div className="flex justify-center py-2">
            <Button onClick={onLoadOlder} size="sm" variant="ghost">
              {t("conversation.loadOlder")}
            </Button>
          </div>
        ) : null}
        {rows.map(({ dayLabel, message, showHeader }) => (
          <div key={`${message.ts}${message.deleted ? "-deleted" : ""}`}>
            {dayLabel ? (
              <div className="relative my-3 flex items-center px-4">
                <Separator className="flex-1" />
                <span className="mx-3 shrink-0 rounded-full border border-border/60 bg-card px-3 py-0.5 font-medium text-muted-foreground text-xs">
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
              users={users}
            />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
