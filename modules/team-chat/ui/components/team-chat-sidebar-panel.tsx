// Shell secondary-nav panel for all /mdl/team-chat screens: overview link,
// joined channels, and direct messages, each with unread badges.
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  cn,
  SidebarGroup,
  SidebarGroupContent,
  SidebarNavList,
  SidebarNavSectionLabel,
  SidebarRow,
  SidebarRowButton,
  Skeleton,
} from "@engenty/ui-core";
import { Hash, LayoutDashboard, Lock, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ConversationListItem } from "../api.js";
import { conversationDisplayName, usersById } from "../lib/format.js";
import { useConversationsQuery, useTenantUsersQuery } from "../queries.js";
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
  const { t } = useTranslation("team-chat");
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { session } = useCoreAuthSession();
  const currentUserId = session?.user?.id ?? null;
  const conversationsQuery = useConversationsQuery(false);
  const conversations = conversationsQuery.data ?? [];
  const usersQuery = useTenantUsersQuery();
  const users = usersById(usersQuery.data);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [dmDialogOpen, setDmDialogOpen] = useState(false);

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
