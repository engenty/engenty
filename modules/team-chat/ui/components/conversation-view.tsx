import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@engenty/ui-core";
import { Hash, Lock, MessagesSquare, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMentionCandidates } from "../hooks/use-mention-candidates.js";
import { conversationDisplayName, usersById } from "../lib/format.js";
import {
  useConversationQuery,
  useDeleteMessageMutation,
  useHistoryQuery,
  useJoinChannelMutation,
  useMarkConversationMutation,
  usePinsQuery,
  usePostMessageMutation,
  useTenantUsersQuery,
  useTogglePinMutation,
  useToggleReactionMutation,
  useUpdateMessageMutation,
} from "../queries.js";
import { Composer } from "./composer.js";
import { InlineThread } from "./inline-thread.js";
import { MessageList } from "./message-list.js";

export function ConversationView({
  conversationId,
  embedded = false,
}: {
  conversationId: string;
  /** Rendered inside another surface (e.g. the project Chat tab). */
  embedded?: boolean;
}) {
  const { t } = useTranslation("team-chat");
  // Threads are expanded inline by default; users can collapse individual ones.
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(
    new Set()
  );
  const { session } = useCoreAuthSession();
  const currentUserId = session?.user?.id ?? null;

  const conversationQuery = useConversationQuery(conversationId);
  const historyQuery = useHistoryQuery(conversationId);
  const usersQuery = useTenantUsersQuery();
  const users = usersById(usersQuery.data);
  const post = usePostMessageMutation();
  const remove = useDeleteMessageMutation();
  const join = useJoinChannelMutation();
  const mark = useMarkConversationMutation();
  const updateMessage = useUpdateMessageMutation();
  const toggleReaction = useToggleReactionMutation();
  const togglePin = useTogglePinMutation();
  const pinsQuery = usePinsQuery(conversationId);
  const mentionCandidates = useMentionCandidates();
  const pinnedTs = useMemo(
    () => new Set((pinsQuery.data ?? []).map((pin) => pin.message_ts)),
    [pinsQuery.data]
  );

  const conversation = conversationQuery.data;
  // history arrives newest-first; render chronological.
  const messages = useMemo(
    () => [...(historyQuery.data?.messages ?? [])].reverse(),
    [historyQuery.data]
  );
  const latestTs = messages.at(-1)?.ts ?? null;

  // Reading the conversation advances the read cursor (conversations.mark).
  useEffect(() => {
    if (
      latestTs &&
      conversation?.is_member &&
      conversation.last_read_ts !== latestTs
    ) {
      mark.mutate({ channel: conversationId, ts: latestTs });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestTs, conversationId, conversation?.is_member]);

  if (conversationQuery.isLoading) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty>
          <EmptyHeader>
            <MessagesSquare className="size-8 text-muted-foreground" />
            <EmptyTitle>{t("conversation.notFound")}</EmptyTitle>
            <EmptyDescription>
              {t("conversation.notFoundHint")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const displayName = conversationDisplayName(
    conversation,
    users,
    currentUserId
  );
  const isChannel =
    conversation.type === "public_channel" ||
    conversation.type === "private_channel";
  const HeaderIcon =
    conversation.type === "private_channel" ? Lock : isChannel ? Hash : Users;
  const memberCount = conversation.is_member
    ? undefined
    : conversation.members.length;
  const canPost = conversation.is_member && !conversation.is_archived;
  const canDeleteFor = (userId: string | null) =>
    Boolean(userId && userId === currentUserId) ||
    conversation.member_role === "owner";

  // Inline threads are open by default; toggling flips the collapsed set.
  const toggleThread = (ts: string) => {
    setCollapsedThreads((previous) => {
      const next = new Set(previous);
      if (next.has(ts)) {
        next.delete(ts);
      } else {
        next.add(ts);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {embedded ? null : (
        <div className="flex h-12 shrink-0 items-center gap-2 border-border/60 border-b px-4">
          <HeaderIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-semibold">{displayName}</span>
          {conversation.topic ? (
            <span className="hidden truncate text-muted-foreground text-sm md:inline">
              {conversation.topic}
            </span>
          ) : null}
          {typeof memberCount === "number" ? (
            <span className="ml-auto text-muted-foreground text-xs">
              {t("conversation.members", { count: memberCount })}
            </span>
          ) : null}
        </div>
      )}

      {conversation.is_archived ? (
        <div className="border-border/60 border-b bg-muted/40 px-4 py-2 text-muted-foreground text-sm">
          {t("conversation.archived")}
        </div>
      ) : null}

      <MessageList
        canDelete={(message) => canDeleteFor(message.user_id)}
        canEdit={(message) =>
          Boolean(message.user_id && message.user_id === currentUserId)
        }
        collapsedThreads={collapsedThreads}
        currentUserId={currentUserId}
        emptyState={
          <Empty className="mx-auto">
            <EmptyHeader>
              <MessagesSquare className="size-8 text-muted-foreground" />
              <EmptyTitle>{t("conversation.empty")}</EmptyTitle>
              <EmptyDescription>
                {isChannel
                  ? t("conversation.emptyHint", { name: displayName })
                  : t("conversation.emptyDmHint")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        messages={messages}
        onDelete={(ts) =>
          remove.mutate(
            { channel: conversationId, ts },
            {
              onError: (error) =>
                toast.error(t("toasts.actionFailed", { error: String(error) })),
              onSuccess: () => toast.success(t("toasts.deleted")),
            }
          )
        }
        onOpenThread={toggleThread}
        onSaveEdit={async (ts, text) => {
          await updateMessage.mutateAsync(
            { channel: conversationId, text, ts },
            {
              onError: (error) =>
                toast.error(t("toasts.actionFailed", { error: String(error) })),
            }
          );
        }}
        onTogglePin={(ts, pinned) =>
          togglePin.mutate(
            { channel: conversationId, pinned, timestamp: ts },
            {
              onError: (error) =>
                toast.error(t("toasts.actionFailed", { error: String(error) })),
            }
          )
        }
        onToggleReaction={(ts, emoji, active) =>
          toggleReaction.mutate(
            { active, channel: conversationId, name: emoji, timestamp: ts },
            {
              onError: (error) =>
                toast.error(t("toasts.actionFailed", { error: String(error) })),
            }
          )
        }
        pinnedTs={pinnedTs}
        renderThread={(ts) => (
          <InlineThread
            canDeleteFor={canDeleteFor}
            conversationId={conversationId}
            currentUserId={currentUserId}
            threadTs={ts}
            users={users}
          />
        )}
        users={users}
      />

      {canPost ? (
        <Composer
          mentionCandidates={mentionCandidates}
          onSend={async (text) => {
            await post.mutateAsync(
              { channel: conversationId, text },
              {
                onError: (error) =>
                  toast.error(t("toasts.sendFailed", { error: String(error) })),
              }
            );
          }}
          placeholder={t("composer.placeholder", {
            name: isChannel ? `#${displayName}` : displayName,
          })}
          sending={post.isPending}
        />
      ) : conversation.type === "public_channel" &&
        !conversation.is_archived ? (
        <div className="flex items-center justify-between gap-3 border-border/60 border-t bg-card px-4 py-3">
          <span className="text-muted-foreground text-sm">
            {t("conversation.joinPrompt", { name: displayName })}
          </span>
          <Button
            disabled={join.isPending}
            onClick={() =>
              join.mutate(conversationId, {
                onError: (error) =>
                  toast.error(
                    t("toasts.actionFailed", { error: String(error) })
                  ),
                onSuccess: () => toast.success(t("toasts.joined")),
              })
            }
            size="sm"
          >
            {t("conversation.join")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
