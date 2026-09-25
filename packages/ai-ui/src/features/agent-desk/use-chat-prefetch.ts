"use client";

// Warm a chat before it is opened: on hover or focus of its row, and for the
// few most recent chats once the app is idle. Opening one then shows its
// transcript from the cache instead of waiting on the network. Each call goes
// through the same query options the lane uses, so a fresh entry is not
// fetched twice.

import { threadIdFromEngagement } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { useMemo } from "react";
import {
  appsAiThreadDetailQueryOptions,
  appsAiThreadMessagesQueryOptions,
} from "../../ag-ui/apps-ai/apps-ai-thread-api.js";
import { useEngentyThreadsContext } from "../../threads/engenty-threads-provider.js";
import { getAgentDeskFeed } from "./agent-desk-api.js";
import { resolveAgentDeskDefault } from "./agent-desk-defaults.js";
import { agentDeskKeys } from "./use-agent-desk-feed.js";

export interface ChatPrefetch {
  /** A desk: its feed, then the conversation the desk opens on. */
  agentDesk: (input: { agentId: string; spaceId: string | null }) => void;
  /** A known thread: its detail and newest page. */
  thread: (threadId: string) => void;
}

export function useChatPrefetch(): ChatPrefetch {
  const queryClient = useQueryClient();
  const { isTransportReady, serviceBaseUrl } = useEngentyThreadsContext();
  const { i18n } = useTranslation();
  const locale = i18n.language || "en";

  return useMemo((): ChatPrefetch => {
    const ready = isTransportReady && serviceBaseUrl.length > 0;
    const thread = (threadId: string) => {
      const id = threadId.trim();
      if (!(ready && id)) {
        return;
      }
      const params = { serviceBaseUrl, threadId: id };
      void queryClient.prefetchQuery(appsAiThreadDetailQueryOptions(params));
      void queryClient.prefetchInfiniteQuery(
        appsAiThreadMessagesQueryOptions(params)
      );
    };
    const agentDesk = (input: { agentId: string; spaceId: string | null }) => {
      if (!(ready && input.agentId)) {
        return;
      }
      void queryClient
        .fetchQuery({
          queryFn: ({ signal }) =>
            getAgentDeskFeed(
              {
                agent_id: input.agentId,
                locale,
                space_id: input.spaceId,
              },
              signal
            ),
          queryKey: agentDeskKeys.feed(input.spaceId, input.agentId, locale),
          staleTime: 30_000,
        })
        .then((feed) => {
          const engagement = resolveAgentDeskDefault(feed).engagement;
          const threadId = engagement
            ? threadIdFromEngagement(engagement.id)
            : null;
          if (threadId) {
            thread(threadId);
          }
        })
        .catch(() => {
          // A prefetch that fails costs nothing: the desk loads on open.
        });
    };
    return { agentDesk, thread };
  }, [isTransportReady, locale, queryClient, serviceBaseUrl]);
}
