// Module home: a Slack-style activity dashboard. Left column carries the
// people-directed feeds (mentions as real messages, my threads); right column
// carries conversation state (unreads with badges, latest activity). One
// activity-feed op + the sidebar conversations query feed the whole page.
import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  cn,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ScrollArea,
  Skeleton,
} from "@engenty/ui-core";
import {
  AtSign,
  Bot,
  Hash,
  Inbox,
  Lock,
  MessagesSquare,
  Pin,
  Plus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ConversationListItem, TeamChatMessage } from "../api.js";
import {
  authorColorClass,
  authorLabel,
  conversationDisplayName,
  mentionTokensToPlainText,
  timeAgo,
  type UsersById,
  usersById,
} from "../lib/format.js";
import {
  useActivityFeedQuery,
  useConversationsQuery,
  useTenantUsersQuery,
} from "../queries.js";
import { NewChannelDialog } from "./new-channel-dialog.js";
import { NewDmDialog } from "./new-dm-dialog.js";

type FeedMessage = TeamChatMessage & { conversation_name: string | null };

function conversationIcon(conversation: ConversationListItem) {
  if (conversation.type === "private_channel") {
    return Lock;
  }
  if (conversation.type === "public_channel") {
    return Hash;
  }
  return Users;
}

/** One message in a feed: author, channel chip, preview, relative time.
 * Links straight to the message (`?ts=`) so the channel scrolls to it. */
function FeedRow({
  locale,
  message,
  unread = false,
  users,
}: {
  locale: string;
  message: FeedMessage;
  unread?: boolean;
  users: UsersById;
}) {
  const isAgent = Boolean(message.agent_type_key);
  const author = authorLabel(message, users);
  const authorId = message.user_id ?? message.agent_type_key ?? "system";
  const preview = mentionTokensToPlainText(message.text, users);
  return (
    <Link
      className="group flex flex-col gap-0.5 rounded-md px-3 py-2 transition-colors hover:bg-foreground/5 dark:hover:bg-foreground/6"
      to={`/mdl/team-chat/${message.conversation_id}?ts=${message.ts}`}
    >
      <span className="flex items-baseline gap-1.5">
        {unread ? (
          <span className="size-2 shrink-0 self-center rounded-full bg-sky-500" />
        ) : null}
        {isAgent ? (
          <Bot className="size-3.5 shrink-0 self-center text-violet-600 dark:text-violet-400" />
        ) : null}
        <span
          className={cn(
            "truncate font-semibold text-xs",
            isAgent
              ? "text-violet-700 dark:text-violet-300"
              : authorColorClass(authorId)
          )}
        >
          {author}
        </span>
        {message.conversation_name ? (
          <span className="flex min-w-0 items-center gap-0.5 truncate text-muted-foreground text-xs">
            <Hash className="size-3 shrink-0" />
            {message.conversation_name}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70 tabular-nums">
          {timeAgo(message.ts, locale)}
        </span>
      </span>
      <span
        className={cn(
          "line-clamp-2 text-sm leading-snug",
          unread ? "font-medium text-foreground" : "text-foreground/90"
        )}
      >
        {preview}
      </span>
    </Link>
  );
}

/** One thread root: preview + reply count + last activity. */
function ThreadRow({
  locale,
  message,
  users,
}: {
  locale: string;
  message: FeedMessage;
  users: UsersById;
}) {
  const { t } = useTranslation("team-chat");
  const preview = mentionTokensToPlainText(message.text, users);
  return (
    <Link
      className="group flex flex-col gap-0.5 rounded-md px-3 py-2 transition-colors hover:bg-foreground/5 dark:hover:bg-foreground/6"
      to={`/mdl/team-chat/${message.conversation_id}?ts=${message.ts}`}
    >
      <span className="flex items-baseline gap-1.5">
        {message.conversation_name ? (
          <span className="flex min-w-0 items-center gap-0.5 truncate font-semibold text-muted-foreground text-xs">
            <Hash className="size-3 shrink-0" />
            {message.conversation_name}
          </span>
        ) : null}
        <span className="shrink-0 font-medium text-sky-700 text-xs dark:text-sky-300">
          {t("thread.replyCount", { count: message.reply_count })}
        </span>
        {message.latest_reply ? (
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70 tabular-nums">
            {timeAgo(message.latest_reply, locale)}
          </span>
        ) : null}
      </span>
      <span className="line-clamp-2 text-foreground/90 text-sm leading-snug">
        {preview}
      </span>
    </Link>
  );
}

/** Conversation row: icon, name, preview, unread/mention badges. */
function ConversationRow({
  conversation,
  label,
  locale,
  users,
}: {
  conversation: ConversationListItem;
  label: string;
  locale: string;
  users: UsersById;
}) {
  const { t } = useTranslation("team-chat");
  const Icon = conversationIcon(conversation);
  const preview = conversation.last_message
    ? mentionTokensToPlainText(conversation.last_message.text, users)
    : null;
  return (
    <Link
      className="group flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-foreground/5 dark:hover:bg-foreground/6"
      to={`/mdl/team-chat/${conversation.id}`}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "truncate text-sm",
              conversation.unread_count > 0 ? "font-semibold" : "font-medium"
            )}
          >
            {label}
          </span>
          {conversation.last_message ? (
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70 tabular-nums">
              {timeAgo(conversation.last_message.ts, locale)}
            </span>
          ) : null}
        </span>
        {preview ? (
          <span className="truncate text-muted-foreground text-xs">
            {preview}
          </span>
        ) : null}
      </span>
      {conversation.mention_count > 0 ? (
        <Badge variant="default">
          {t("overview.mentionCount", { count: conversation.mention_count })}
        </Badge>
      ) : conversation.unread_count > 0 ? (
        <Badge variant="secondary">
          {t("overview.unreadCount", { count: conversation.unread_count })}
        </Badge>
      ) : null}
    </Link>
  );
}

/** Dashboard card: icon + title header, divided list body. */
function FeedCard({
  children,
  count,
  empty,
  icon: Icon,
  loading,
  title,
}: {
  children: React.ReactNode;
  count: number;
  empty: string;
  icon: typeof Inbox;
  loading: boolean;
  title: string;
}) {
  return (
    <section className="ui-canvas-raised flex flex-col rounded-lg bg-card">
      <h2 className="flex items-center gap-2 border-border/60 border-b px-4 py-2.5 font-semibold text-sm">
        <Icon className="size-4 text-muted-foreground" /> {title}
        {count > 0 ? (
          <span className="text-muted-foreground text-xs">{count}</span>
        ) : null}
      </h2>
      <div className="flex flex-col p-1.5">
        {loading ? (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : count === 0 ? (
          <p className="px-3 py-3 text-muted-foreground text-sm">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function TeamChatOverview() {
  const { t, i18n } = useTranslation("team-chat");
  const locale = i18n.language;
  const { session } = useCoreAuthSession();
  const currentUserId = session?.user?.id ?? null;
  const conversationsQuery = useConversationsQuery(false);
  const feedQuery = useActivityFeedQuery();
  const usersQuery = useTenantUsersQuery();
  const users = usersById(usersQuery.data);
  const conversations = conversationsQuery.data ?? [];
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [dmDialogOpen, setDmDialogOpen] = useState(false);

  const labelFor = (conversation: ConversationListItem) =>
    conversationDisplayName(conversation, users, currentUserId);

  const mentions = feedQuery.data?.mentions ?? [];
  const pins = feedQuery.data?.pins ?? [];
  const threads = feedQuery.data?.threads ?? [];
  const unread = conversations.filter(
    (conversation) => conversation.unread_count > 0
  );
  const recent = conversations
    .filter((conversation) => conversation.last_message)
    .sort((a, b) =>
      (b.last_message?.ts ?? "").localeCompare(a.last_message?.ts ?? "")
    )
    .slice(0, 8);
  const totalUnread = conversations.reduce(
    (sum, conversation) => sum + conversation.unread_count,
    0
  );

  if (!conversationsQuery.isLoading && conversations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty>
          <EmptyHeader>
            <MessagesSquare className="size-8 text-muted-foreground" />
            <EmptyTitle>{t("overview.noConversations")}</EmptyTitle>
            <EmptyDescription>
              {t("overview.noConversationsHint")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-semibold text-xl">{t("overview.title")}</h1>
            <p className="text-muted-foreground text-sm">
              {totalUnread > 0
                ? t("overview.subtitleUnread", { count: totalUnread })
                : t("overview.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setDmDialogOpen(true)}
              size="sm"
              variant="outline"
            >
              <MessagesSquare className="size-4" /> {t("overview.newDm")}
            </Button>
            <Button onClick={() => setChannelDialogOpen(true)} size="sm">
              <Plus className="size-4" /> {t("overview.newChannel")}
            </Button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <FeedCard
              count={mentions.length}
              empty={t("overview.allCaughtUp")}
              icon={AtSign}
              loading={feedQuery.isLoading}
              title={t("overview.mentions")}
            >
              {mentions.map((message) => (
                <FeedRow
                  key={`${message.conversation_id}:${message.ts}`}
                  locale={locale}
                  message={message}
                  unread={message.unread}
                  users={users}
                />
              ))}
            </FeedCard>

            <FeedCard
              count={threads.length}
              empty={t("overview.noThreads")}
              icon={MessagesSquare}
              loading={feedQuery.isLoading}
              title={t("overview.threads")}
            >
              {threads.map((message) => (
                <ThreadRow
                  key={`${message.conversation_id}:${message.ts}`}
                  locale={locale}
                  message={message}
                  users={users}
                />
              ))}
            </FeedCard>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <FeedCard
              count={unread.length}
              empty={t("overview.allCaughtUp")}
              icon={Inbox}
              loading={conversationsQuery.isLoading}
              title={t("overview.unreads")}
            >
              {unread.map((conversation) => (
                <ConversationRow
                  conversation={conversation}
                  key={conversation.id}
                  label={labelFor(conversation)}
                  locale={locale}
                  users={users}
                />
              ))}
            </FeedCard>

            <FeedCard
              count={recent.length}
              empty={t("overview.noRecent")}
              icon={Hash}
              loading={conversationsQuery.isLoading}
              title={t("overview.recent")}
            >
              {recent.map((conversation) => (
                <ConversationRow
                  conversation={conversation}
                  key={conversation.id}
                  label={labelFor(conversation)}
                  locale={locale}
                  users={users}
                />
              ))}
            </FeedCard>

            <FeedCard
              count={pins.length}
              empty={t("overview.noPins")}
              icon={Pin}
              loading={feedQuery.isLoading}
              title={t("overview.pins")}
            >
              {pins.map((message) => (
                <FeedRow
                  key={`${message.conversation_id}:${message.ts}`}
                  locale={locale}
                  message={message}
                  users={users}
                />
              ))}
            </FeedCard>
          </div>
        </div>
      </div>

      <NewChannelDialog
        onOpenChange={setChannelDialogOpen}
        open={channelDialogOpen}
      />
      <NewDmDialog onOpenChange={setDmDialogOpen} open={dmDialogOpen} />
    </ScrollArea>
  );
}
