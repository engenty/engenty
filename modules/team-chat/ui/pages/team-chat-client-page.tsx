// Team chat: the channel list lives in the shell secondary nav; the selected
// conversation is the `/mdl/team-chat/:conversationId` route param so it
// deep-links; an open thread travels as `?thread=<ts>`.
//
// This page owns the shell chrome: breadcrumbs, the transparent topbar
// floating over the blended DetailPageHeader (topbarOverlap), and the primary
// actions in the topbar — dashboard: new DM / new channel / ⋯; conversation:
// pins / details / ⋯ (edit topic, leave). It also records every opened
// conversation for the dashboard's recent-tab strip.
import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import {
  LogOut,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ChannelDetailsPopover } from "../components/channel-details-popover.js";
import { ConversationView } from "../components/conversation-view.js";
import { EditTopicDialog } from "../components/edit-topic-dialog.js";
import { NewChannelDialog } from "../components/new-channel-dialog.js";
import { NewDmDialog } from "../components/new-dm-dialog.js";
import { PinsPopover } from "../components/pins-popover.js";
import { TeamChatOverview } from "../components/team-chat-overview.js";
import { useRecentConversationTabs } from "../hooks/use-recent-conversation-tabs.js";
import { useTeamChatSecondaryNav } from "../hooks/use-team-chat-secondary-nav.js";
import { conversationDisplayName, usersById } from "../lib/format.js";
import {
  teamChatKeys,
  useConversationQuery,
  useLeaveChannelMutation,
  useTenantUsersQuery,
} from "../queries.js";

export function TeamChatClientPage() {
  const { t } = useTranslation("team-chat");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { session } = useCoreAuthSession();
  const currentUserId = session?.user?.id ?? null;
  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTeamChatSecondaryNav();
  const conversationQuery = useConversationQuery(conversationId ?? null);
  const usersQuery = useTenantUsersQuery();
  const users = usersById(usersQuery.data);
  const leave = useLeaveChannelMutation();
  const { record } = useRecentConversationTabs();

  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [dmDialogOpen, setDmDialogOpen] = useState(false);
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);

  const conversation = conversationQuery.data ?? null;

  // Every successfully opened conversation becomes a dashboard tab (max 5).
  useEffect(() => {
    if (conversationId && conversation?.id === conversationId) {
      record(conversationId);
    }
  }, [conversationId, conversation?.id, record]);

  const conversationLabel = useMemo(() => {
    if (!(conversationId && conversation)) {
      return null;
    }
    const label = conversationDisplayName(conversation, users, currentUserId);
    return conversation.name ? `#${label}` : label;
  }, [conversationId, conversation, users, currentUserId]);

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      ...(conversationLabel
        ? [{ label: conversationLabel }]
        : [{ label: t("nav.overview") }]),
    ],
    [moduleRootCrumb, conversationLabel, t]
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: teamChatKeys.all });

  const isChannel =
    conversation?.type === "public_channel" ||
    conversation?.type === "private_channel";

  const leaveChannel = () => {
    if (!conversationId) {
      return;
    }
    leave.mutate(conversationId, {
      onError: (error) =>
        toast.error(t("toasts.actionFailed", { error: String(error) })),
      onSuccess: () => {
        toast.success(t("toasts.left"));
        navigate("/mdl/team-chat");
      },
    });
  };

  const pageActions = useMemo(() => {
    if (!conversationId) {
      return (
        <div className="flex min-w-0 shrink items-center gap-1">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("actions.more")}
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={refresh}>
                <RefreshCw className="size-4" /> {t("actions.refresh")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }
    if (!conversation) {
      return null;
    }
    return (
      <div className="flex min-w-0 shrink items-center gap-1">
        <PinsPopover conversationId={conversation.id} users={users} />
        <ChannelDetailsPopover conversation={conversation} users={users} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("actions.more")}
              size="icon-sm"
              variant="ghost"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isChannel && conversation.is_member ? (
              <DropdownMenuItem onClick={() => setTopicDialogOpen(true)}>
                <Pencil className="size-4" /> {t("actions.editTopic")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={refresh}>
              <RefreshCw className="size-4" /> {t("actions.refresh")}
            </DropdownMenuItem>
            {isChannel && conversation.is_member ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={leaveChannel} variant="destructive">
                  <LogOut className="size-4" /> {t("conversation.leave")}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation, users, isChannel, t]);

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    // Float the transparent topbar over the white blended header.
    topbarOverlap: true,
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden">
      {conversationId ? (
        <ConversationView conversationId={conversationId} />
      ) : (
        <TeamChatOverview />
      )}

      <NewChannelDialog
        onOpenChange={setChannelDialogOpen}
        open={channelDialogOpen}
      />
      <NewDmDialog onOpenChange={setDmDialogOpen} open={dmDialogOpen} />
      {conversationId && conversation ? (
        <EditTopicDialog
          conversationId={conversationId}
          initialTopic={conversation.topic ?? ""}
          onOpenChange={setTopicDialogOpen}
          open={topicDialogOpen}
        />
      ) : null}
    </div>
  );
}
