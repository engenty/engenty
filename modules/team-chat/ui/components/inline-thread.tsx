// Inline thread expansion: replies render under the parent message inside the
// stream (no side panel), indented behind a colored rail, with a compact
// reply composer at the end.
import { useTranslation } from "@engenty/i18n/ui";
import { cn, Skeleton } from "@engenty/ui-core";
import { toast } from "sonner";
import { useMentionCandidates } from "../hooks/use-mention-candidates.js";
import { sameGroup, type UsersById } from "../lib/format.js";
import {
  useDeleteMessageMutation,
  usePostMessageMutation,
  useRepliesQuery,
  useToggleReactionMutation,
  useUpdateMessageMutation,
} from "../queries.js";
import { Composer } from "./composer.js";
import { MessageItem } from "./message-item.js";

export interface InlineThreadProps {
  canDeleteFor: (userId: string | null) => boolean;
  conversationId: string;
  currentUserId: string | null;
  threadTs: string;
  users: UsersById;
}

export function InlineThread({
  canDeleteFor,
  conversationId,
  currentUserId,
  threadTs,
  users,
}: InlineThreadProps) {
  const { t } = useTranslation("team-chat");
  const repliesQuery = useRepliesQuery(conversationId, threadTs);
  const post = usePostMessageMutation();
  const remove = useDeleteMessageMutation();
  const updateMessage = useUpdateMessageMutation();
  const toggleReaction = useToggleReactionMutation();
  const mentionCandidates = useMentionCandidates();
  // The replies op returns [parent, ...replies]; the parent already renders
  // above as the stream message.
  const replies = (repliesQuery.data?.messages ?? []).filter(
    (message) => message.ts !== threadTs
  );

  return (
    <div className="mt-1 mb-1.5 ml-[4.25rem] border-sky-200 border-l-2 pl-1 dark:border-sky-800">
      {repliesQuery.isLoading ? (
        <div className="flex flex-col gap-2 py-2 pl-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-8 w-1/2" />
        </div>
      ) : (
        <div className={cn("flex flex-col", replies.length > 0 && "pb-1")}>
          {replies.map((message, index) => (
            <MessageItem
              canDelete={canDeleteFor(message.user_id)}
              canEdit={Boolean(
                message.user_id && message.user_id === currentUserId
              )}
              currentUserId={currentUserId}
              inThread
              key={message.ts}
              message={message}
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
                  {
                    active,
                    channel: conversationId,
                    name: emoji,
                    timestamp: ts,
                  },
                  {
                    onError: (error) =>
                      toast.error(
                        t("toasts.actionFailed", { error: String(error) })
                      ),
                  }
                )
              }
              showHeader={!sameGroup(replies[index - 1], message)}
              users={users}
            />
          ))}
        </div>
      )}

      <Composer
        compact
        conversationId={conversationId}
        mentionCandidates={mentionCandidates}
        onSend={async (text, files) => {
          await post.mutateAsync(
            {
              channel: conversationId,
              text,
              thread_ts: threadTs,
              ...(files.length > 0
                ? {
                    files: files.map(
                      (f) => ({ ...f }) as Record<string, unknown>
                    ),
                  }
                : {}),
            },
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
