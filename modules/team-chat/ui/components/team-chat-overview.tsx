// Module home: a Slack-style activity dashboard. A blended DetailPageHeader
// carries title + subtitle and the conversation tab strip (last 5 opened,
// closable); the content column opens with four stat tiles, then the feed
// cards: mentions + my threads (left), unreads + latest + pins (right).
// A conversation tab renders its stream inline below the header — the active
// tab travels as the URL hash (`#<conversationId>`), never the channel route.
// Primary actions (new channel / DM, ⋯) live in the shell topbar.
import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  cn,
  DetailPageHeader,
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
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ConversationListItem, TeamChatMessage } from "../api.js";
import { useRecentConversationTabs } from "../hooks/use-recent-conversation-tabs.js";
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
import { ConversationView } from "./conversation-view.js";
import { TeamChatTabStrip } from "./team-chat-tab-strip.js";

type FeedMessage = TeamChatMessage & { conversation_name: string | null };

/** Tinted icon-badge tones (literal pairs per the DESIGN.md badge rule). */
const TONES = {
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  primary: "bg-primary/10 text-primary",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
} as const;

type Tone = keyof typeof TONES;

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
            authorColorClass(isAgent)
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
  const Icon =
    conversation.type === "private_channel"
      ? Lock
      : conversation.type === "public_channel"
        ? Hash
        : Users;
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

/** Compact stat tile: tinted icon badge + number + label. */
function StatTile({
  icon: Icon,
  label,
  loading,
  tone,
  value,
}: {
  icon: typeof Inbox;
  label: string;
  loading: boolean;
  tone: Tone;
  value: number;
}) {
  return (
    <div className="ui-card-raised flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          TONES[tone]
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        {loading ? (
          <Skeleton className="h-5 w-8" />
        ) : (
          <span className="font-semibold text-lg tabular-nums leading-tight">
            {value}
          </span>
        )}
        <span className="truncate text-muted-foreground text-xs">{label}</span>
      </span>
    </div>
  );
}

/** Dashboard card: tinted icon badge + title header, divided list body. */
function FeedCard({
  children,
  count,
  empty,
  icon: Icon,
  loading,
  title,
  tone,
}: {
  children: React.ReactNode;
  count: number;
  empty: string;
  icon: typeof Inbox;
  loading: boolean;
  title: string;
  tone: Tone;
}) {
  return (
    <section className="ui-card-raised flex flex-col">
      <h2 className="flex items-center gap-2.5 border-border-soft border-b px-4 py-2.5">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md",
            TONES[tone]
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="font-semibold text-sm">{title}</span>
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
  const navigate = useNavigate();
  const { hash } = useLocation();
  // The active conversation tab lives in the URL hash so switching tabs never
  // leaves the dashboard route; no hash = the overview tab.
  const activeId = hash.length > 1 ? hash.slice(1) : null;
  const conversationsQuery = useConversationsQuery(false);
  const feedQuery = useActivityFeedQuery();
  const usersQuery = useTenantUsersQuery();
  const users = usersById(usersQuery.data);
  const conversations = conversationsQuery.data ?? [];
  const { close, record, tabs } = useRecentConversationTabs();

  const labelFor = (conversation: ConversationListItem) =>
    conversationDisplayName(conversation, users, currentUserId);

  const conversationsById = useMemo(
    () =>
      new Map(
        conversations.map((conversation) => [conversation.id, conversation])
      ),
    [conversations]
  );

  // A tab the user just closed while it was active: router navigations are
  // transitions, so the tab state can commit one render before the hash
  // clears — the record effect must not re-add it in that window.
  const closedActiveTab = useRef<string | null>(null);

  // A deep-linked hash for a conversation that isn't a tab yet (shared URL)
  // gets one; existing tabs keep their order — no reshuffle while clicking.
  useEffect(() => {
    if (!activeId) {
      closedActiveTab.current = null;
      return;
    }
    if (
      activeId !== closedActiveTab.current &&
      conversationsById.has(activeId) &&
      !tabs.includes(activeId)
    ) {
      record(activeId);
    }
  }, [activeId, conversationsById, tabs, record]);

  const closeTab = (conversationId: string) => {
    if (conversationId === activeId) {
      closedActiveTab.current = conversationId;
      navigate("/mdl/team-chat", { replace: true });
    }
    close(conversationId);
  };

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
  const statsLoading = feedQuery.isLoading || conversationsQuery.isLoading;

  const emptyModule =
    !conversationsQuery.isLoading && conversations.length === 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <DetailPageHeader
        belowStrip={
          <TeamChatTabStrip
            activeId={activeId}
            conversationsById={conversationsById}
            labelFor={labelFor}
            onClose={closeTab}
            tabs={tabs}
          />
        }
        containerClassName="px-4 sm:px-6"
        description={
          <p className="text-muted-foreground text-sm">
            {totalUnread > 0
              ? t("overview.subtitleUnread", { count: totalUnread })
              : t("overview.subtitle")}
          </p>
        }
        sticky={false}
        title={t("overview.title")}
      />

      {activeId ? (
        // Inline conversation tab: same reading column as the header/feed so
        // the stream and composer stay aligned with the title above.
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden">
          <ConversationView conversationId={activeId} embedded />
        </div>
      ) : emptyModule ? (
        <div className="flex flex-1 items-center justify-center">
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
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                icon={AtSign}
                label={t("overview.mentions")}
                loading={statsLoading}
                tone="sky"
                value={mentions.length}
              />
              <StatTile
                icon={Inbox}
                label={t("overview.statUnread")}
                loading={statsLoading}
                tone="primary"
                value={totalUnread}
              />
              <StatTile
                icon={MessagesSquare}
                label={t("overview.statThreads")}
                loading={statsLoading}
                tone="violet"
                value={threads.length}
              />
              <StatTile
                icon={Pin}
                label={t("overview.pins")}
                loading={statsLoading}
                tone="amber"
                value={pins.length}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-4">
                <FeedCard
                  count={mentions.length}
                  empty={t("overview.allCaughtUp")}
                  icon={AtSign}
                  loading={feedQuery.isLoading}
                  title={t("overview.mentions")}
                  tone="sky"
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
                  tone="violet"
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
                  tone="primary"
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
                  tone="primary"
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
                  tone="amber"
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
        </ScrollArea>
      )}
    </div>
  );
}
