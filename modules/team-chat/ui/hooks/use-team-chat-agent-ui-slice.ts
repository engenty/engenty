import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";

export function useTeamChatClientAgentUiSlice(input: {
  conversationId: string | null;
  conversationLabel: string | null;
  conversationType?: string | null;
  threadTs?: string | null;
}) {
  const slice = useMemo(() => {
    const conversationId = input.conversationId?.trim() || null;
    const channelLabel = input.conversationLabel?.trim() || null;
    const threadTs = input.threadTs?.trim() || null;

    if (!conversationId) {
      return {
        page: {
          ...buildAgentUiPageBrief({
            page_type: "list",
            page_title: "Team chat",
            page_description:
              "Team chat overview — recent conversations, mentions, threads, and unreads. No channel selected.",
          }),
        },
      };
    }

    const isChannel =
      input.conversationType === "public_channel" ||
      input.conversationType === "private_channel";
    const title = channelLabel ?? "Conversation";
    const kind = isChannel ? "channel" : "direct message";
    const pageDescription = threadTs
      ? `Viewing team-chat ${kind} ${title} with thread ${threadTs} open.`
      : `Viewing team-chat ${kind} ${title}.`;

    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title,
          page_description: pageDescription,
        }),
        channel_id: conversationId,
        ...(channelLabel ? { channel_label: channelLabel } : {}),
        ...(threadTs ? { thread_ts: threadTs, thread_label: threadTs } : {}),
      },
      selection: {
        entity_id: conversationId,
        entity_type: isChannel ? "team_chat_channel" : "team_chat_conversation",
        ...(threadTs ? { selected_ids: [threadTs] } : {}),
      },
    };
  }, [
    input.conversationId,
    input.conversationLabel,
    input.conversationType,
    input.threadTs,
  ]);

  useRegisterAgentUiSlice("team-chat.client", slice);
}
