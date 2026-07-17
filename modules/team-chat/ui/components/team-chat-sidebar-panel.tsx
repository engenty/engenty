// Shell secondary-nav panel for all /mdl/team-chat screens: overview link,
// joined channels, and direct messages, each with unread badges.
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  cn,
  Input,
  SidebarGroup,
  SidebarGroupContent,
  SidebarNavList,
  SidebarNavSectionLabel,
  SidebarRow,
  SidebarRowButton,
  Skeleton,
} from "@engenty/ui-core";
import { Hash, LayoutDashboard, Lock, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ConversationListItem } from "../api.js";
import {
  authorLabel,
  conversationDisplayName,
  formatMessageTime,
  renderMentionTokens,
  usersById,
} from "../lib/format.js";
import {
  useConversationsQuery,
  useSearchMessagesQuery,
  useTenantUsersQuery,
} from "../queries.js";
import { NewChannelDialog } from "./new-channel-dialog.js";
import { NewDmDialog } from "./new-dm-dialog.js";

function ConversationRow({
  active,
  conversation,
  label,
}: {
  active: boolean;
  conversation: ConversationListItem;
  label: string;
}) {
  const unread = conversation.unread_count > 0;
  const Icon = conversation.type === "private_channel" ? Lock : Hash;
  const isChannel =
    conversation.type === "public_channel" ||
    conversation.type === "private_channel";
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link
          to={`/mdl/team-chat/${conversation.id}`}
          {...shellSecondaryNavItemProps}
        >
          {isChannel ? (
            <Icon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <span className="size-4 shrink-0 rounded-full bg-muted text-center text-[10px] leading-4">
              {label.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              unread && "font-semibold text-foreground",
              conversation.muted && "text-muted-foreground"
            )}
          >
            {label}
          </span>
          {unread ? (
            <Badge className="ml-auto shrink-0" variant="secondary">
              {conversation.unread_count > 99
                ? "99+"
                : conversation.unread_count}
            </Badge>
          ) : null}
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

export function TeamChatSidebarPanel() {
  const { t, i18n } = useTranslation("team-chat");
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { session } = useCoreAuthSession();
  const currentUserId = session?.user?.id ?? null;
  const conversationsQuery = useConversationsQuery(false);
  const conversations = conversationsQuery.data ?? [];
  const usersQuery = useTenantUsersQuery();
  const users = usersById(usersQuery.data);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [dmDialogOpen, setDmDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searching = search.trim().length >= 2;
  const searchQuery = useSearchMessagesQuery(search);

  const channels = conversations.filter(
    (conversation) =>
      conversation.type === "public_channel" ||
      conversation.type === "private_channel"
  );
  const dms = conversations.filter(
    (conversation) => conversation.type === "im" || conversation.type === "mpim"
  );

  const overviewActive = !conversationId;

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="relative px-1 pb-1">
            <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("search.placeholder")}
              className="h-8 pl-8"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("search.placeholder")}
              value={search}
            />
          </div>
        </SidebarGroupContent>
      </SidebarGroup>

      {searching ? (
        <SidebarGroup>
          <SidebarNavSectionLabel>{t("search.results")}</SidebarNavSectionLabel>
          <SidebarGroupContent>
            {searchQuery.isLoading ? (
              <Skeleton className="mx-2 h-6" />
            ) : (searchQuery.data?.messages.length ?? 0) === 0 ? (
              <p className="px-2 py-1 text-muted-foreground text-xs">
                {t("search.noResults")}
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {(searchQuery.data?.messages ?? []).map((message) => (
                  <Link
                    className="flex flex-col gap-0.5 rounded-[4px] px-2 py-1.5 hover:bg-muted/60"
                    key={`${message.conversation_id}-${message.ts}`}
                    onClick={() => setSearch("")}
                    to={`/mdl/team-chat/${message.conversation_id}${message.thread_ts ? `?thread=${message.thread_ts}` : ""}`}
                  >
                    <span className="flex items-baseline gap-1 text-xs">
                      <span className="truncate font-medium">
                        {message.conversation_name
                          ? `#${message.conversation_name}`
                          : authorLabel(message, users)}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {formatMessageTime(message.ts, i18n.language)}
                      </span>
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {renderMentionTokens(message.text, users).replace(
                        /\*\*/g,
                        ""
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}

      <SidebarGroup className={cn(searching && "hidden")}>
        <SidebarGroupContent>
          <SidebarNavList>
            <SidebarRow isActive={overviewActive}>
              <SidebarRowButton asChild isActive={overviewActive}>
                <Link to="/mdl/team-chat" {...shellSecondaryNavItemProps}>
                  <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {t("nav.overview")}
                  </span>
                </Link>
              </SidebarRowButton>
            </SidebarRow>
          </SidebarNavList>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarNavSectionLabel>{t("nav.channels")}</SidebarNavSectionLabel>
        <SidebarGroupContent>
          <SidebarNavList>
            {conversationsQuery.isLoading ? (
              <Skeleton className="mx-2 h-6" />
            ) : (
              channels.map((conversation) => (
                <ConversationRow
                  active={conversation.id === conversationId}
                  conversation={conversation}
                  key={conversation.id}
                  label={conversationDisplayName(
                    conversation,
                    users,
                    currentUserId
                  )}
                />
              ))
            )}
            <SidebarRow isActive={false}>
              <SidebarRowButton
                isActive={false}
                onClick={() => setChannelDialogOpen(true)}
              >
                <Plus className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {t("nav.addChannel")}
                </span>
              </SidebarRowButton>
            </SidebarRow>
          </SidebarNavList>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarNavSectionLabel>
          {t("nav.directMessages")}
        </SidebarNavSectionLabel>
        <SidebarGroupContent>
          <SidebarNavList>
            {dms.map((conversation) => (
              <ConversationRow
                active={conversation.id === conversationId}
                conversation={conversation}
                key={conversation.id}
                label={conversationDisplayName(
                  conversation,
                  users,
                  currentUserId
                )}
              />
            ))}
            <SidebarRow isActive={false}>
              <SidebarRowButton
                isActive={false}
                onClick={() => setDmDialogOpen(true)}
              >
                <Plus className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {t("nav.newDm")}
                </span>
              </SidebarRowButton>
            </SidebarRow>
          </SidebarNavList>
        </SidebarGroupContent>
      </SidebarGroup>

      <NewChannelDialog
        onOpenChange={setChannelDialogOpen}
        open={channelDialogOpen}
      />
      <NewDmDialog onOpenChange={setDmDialogOpen} open={dmDialogOpen} />
    </>
  );
}
