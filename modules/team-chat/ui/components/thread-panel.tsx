import { useTranslation } from "@engenty/i18n/ui";
import { Button, Skeleton } from "@engenty/ui-core";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useMentionCandidates } from "../hooks/use-mention-candidates.js";
import type { UsersById } from "../lib/format.js";
import {
  useDeleteMessageMutation,
  usePostMessageMutation,
  useRepliesQuery,
  useToggleReactionMutation,
  useUpdateMessageMutation,
} from "../queries.js";
import { Composer } from "./composer.js";
import { MessageList } from "./message-list.js";

export interface ThreadPanelProps {
  canDeleteFor: (userId: string | null) => boolean;
  conversationId: string;
  currentUserId: string | null;
  onClose: () => void;
  threadTs: string;
  users: UsersById;
}

export function ThreadPanel({
  canDeleteFor,
  conversationId,
  currentUserId,
  onClose,
  threadTs,
  users,
}: ThreadPanelProps) {
  const { t } = useTranslation("team-chat");
  const repliesQuery = useRepliesQuery(conversationId, threadTs);
  const post = usePostMessageMutation();
  const remove = useDeleteMessageMutation();
  const updateMessage = useUpdateMessageMutation();
  const toggleReaction = useToggleReactionMutation();
  const mentionCandidates = useMentionCandidates();
  const messages = repliesQuery.data?.messages ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-border/60 border-b px-4">
        <span className="font-semibold text-sm">{t("thread.title")}</span>
        <span className="text-muted-foreground text-xs">
          {messages.length > 1
            ? t("thread.replyCount", { count: messages.length - 1 })
            : null}
        </span>
        <Button
          aria-label={t("thread.close")}
          className="ml-auto"
          onClick={onClose}
          size="icon-sm"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>

      {repliesQuery.isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <MessageList
          canDelete={(message) => canDeleteFor(message.user_id)}
          canEdit={(message) =>
            Boolean(message.user_id && message.user_id === currentUserId)
          }
          currentUserId={currentUserId}
          inThread
          messages={messages}
          onDelete={(ts) =>
            remove.mutate(
              { channel: conversationId, ts },
              {
                onError: (error) =>
                  toast.error(
                    t("toasts.actionFailed", { error: String(error) })
                  ),
              }
            )
          }
          onSaveEdit={async (ts, text) => {
            await updateMessage.mutateAsync(
              { channel: conversationId, text, ts },
              {
                onError: (error) =>
                  toast.error(
                    t("toasts.actionFailed", { error: String(error) })
                  ),
              }
            );
          }}
          onToggleReaction={(ts, emoji, active) =>
            toggleReaction.mutate(
              { active, channel: conversationId, name: emoji, timestamp: ts },
              {
                onError: (error) =>
                  toast.error(
                    t("toasts.actionFailed", { error: String(error) })
                  ),
              }
            )
          }
          users={users}
        />
      )}

      <Composer
        mentionCandidates={mentionCandidates}
        onSend={async (text) => {
          await post.mutateAsync(
            { channel: conversationId, text, thread_ts: threadTs },
            {
              onError: (error) =>
                toast.error(t("toasts.sendFailed", { error: String(error) })),
            }
          );
        }}
        placeholder={t("composer.placeholderThread")}
        sending={post.isPending}
      />
    </div>
  );
}
