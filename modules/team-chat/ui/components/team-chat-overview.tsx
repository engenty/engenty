// Module home: streams over the caller's conversations — unreads, mentions,
// and recent activity. Everything deep-links into the conversation route.
import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ScrollArea,
} from "@engenty/ui-core";
import { AtSign, Hash, Inbox, MessagesSquare, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { ConversationListItem } from "../api.js";
import {
  conversationDisplayName,
  renderMentionTokens,
  type UsersById,
  usersById,
} from "../lib/format.js";
import { useConversationsQuery, useTenantUsersQuery } from "../queries.js";

function ConversationCard({
  badge,
  conversation,
  label,
  users,
}: {
  badge: React.ReactNode;
  conversation: ConversationListItem;
  label: string;
  users: UsersById;
}) {
  const isChannel =
    conversation.type === "public_channel" ||
    conversation.type === "private_channel";
  const Icon = isChannel ? Hash : Users;
  const preview = conversation.last_message
    ? renderMentionTokens(conversation.last_message.text, users).replace(
        /\*\*/g,
        ""
      )
    : null;
  return (
    <Link
      className="ui-canvas-raised group flex items-center gap-3 rounded-md bg-card p-3 hover:shadow-[var(--e-3)]"
      to={`/mdl/team-chat/${conversation.id}`}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-sm">{label}</span>
        {preview ? (
          <span className="truncate text-muted-foreground text-xs">
            {preview}
          </span>
        ) : null}
      </span>
      {badge}
    </Link>
  );
}

function Section({
  children,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  icon: typeof Inbox;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 font-semibold text-muted-foreground text-sm">
        <Icon className="size-4" /> {title}
      </h2>
      {children}
    </section>
  );
}

export function TeamChatOverview() {
  const { t } = useTranslation("team-chat");
  const { session } = useCoreAuthSession();
  const currentUserId = session?.user?.id ?? null;
  const conversationsQuery = useConversationsQuery(false);
  const usersQuery = useTenantUsersQuery();
  const users = usersById(usersQuery.data);
  const conversations = conversationsQuery.data ?? [];

  const labelFor = (conversation: ConversationListItem) =>
    conversationDisplayName(conversation, users, currentUserId);

  const mentioned = conversations.filter(
    (conversation) => conversation.mention_count > 0
  );
  const unread = conversations.filter(
    (conversation) =>
      conversation.unread_count > 0 && conversation.mention_count === 0
  );
  const recent = conversations
    .filter((conversation) => conversation.last_message)
    .slice(0, 8);

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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-semibold text-xl">{t("overview.title")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("overview.subtitle")}
          </p>
        </header>

        <Section icon={AtSign} title={t("overview.mentions")}>
          {mentioned.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("overview.allCaughtUp")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {mentioned.map((conversation) => (
                <ConversationCard
                  badge={
                    <Badge variant="default">
                      {t("overview.mentionCount", {
                        count: conversation.mention_count,
                      })}
                    </Badge>
                  }
                  conversation={conversation}
                  key={conversation.id}
                  label={labelFor(conversation)}
                  users={users}
                />
              ))}
            </div>
          )}
        </Section>

        <Section icon={Inbox} title={t("overview.unreads")}>
          {unread.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("overview.allCaughtUp")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {unread.map((conversation) => (
                <ConversationCard
                  badge={
                    <Badge variant="secondary">
                      {t("overview.unreadCount", {
                        count: conversation.unread_count,
                      })}
                    </Badge>
                  }
                  conversation={conversation}
                  key={conversation.id}
                  label={labelFor(conversation)}
                  users={users}
                />
              ))}
            </div>
          )}
        </Section>

        <Section icon={MessagesSquare} title={t("overview.recent")}>
          <div className="flex flex-col gap-2">
            {recent.map((conversation) => (
              <ConversationCard
                badge={null}
                conversation={conversation}
                key={conversation.id}
                label={labelFor(conversation)}
                users={users}
              />
            ))}
          </div>
        </Section>
      </div>
    </ScrollArea>
  );
}
