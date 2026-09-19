"use client";

import { useQuery } from "@engenty/query-client";
import { useMemo } from "react";
import {
  type AppsAiThreadRecord,
  appsAiThreadsListQueryKey,
  listAppsAiThreads,
} from "../../ag-ui/apps-ai/apps-ai-thread-api.js";
import { useEngentyAIContext } from "../../agent-provider/engenty-ai-provider.js";
import { useAiAgentsQuery } from "../../lib/admin/ai-runtime-queries.js";
import { useRoomsDirectoryQuery } from "../agent-desk/conversation-api.js";
import {
  organizeSpaceChats,
  type SpaceChatAgentInfo,
  type SpaceChatKindGroup,
  type SpaceChatRow,
  spaceChatRows,
} from "./space-chats-model.js";

/** Enough rows that "everything in this space" is not quietly a top-20. */
const SPACE_CHATS_LIMIT = 200;

export interface UseSpaceChatsResult {
  error: Error | null;
  /** Grouped by kind, the desks by agent — the full page's shape. */
  groups: SpaceChatKindGroup[];
  isLoading: boolean;
  /** Flat and newest-first — the sidebar's short list. */
  rows: SpaceChatRow[];
}

/**
 * Every conversation in one space, across every agent in it.
 *
 * One request, with a `space_id` and NO host key: the copilot's chats, the
 * coordinator's and each specialist's are all threads in this space, and the
 * host key would narrow them back down to one surface — which is precisely the
 * split this view exists to close (PLAN-space-chats.md).
 *
 * The server still decides what comes back: the thread list is what the
 * viewer is in, and the room directory is what they may read. Nothing here
 * widens that — the grouping only makes the kinds visible.
 */
export function useSpaceChats(input: {
  enabled?: boolean;
  includeArchived?: boolean;
  query?: string;
  spaceId: string | null;
}): UseSpaceChatsResult {
  const { isTransportReady, serviceBaseUrl } = useEngentyAIContext();
  const spaceId = input.spaceId?.trim() || null;
  const enabled =
    (input.enabled ?? true) && isTransportReady && Boolean(spaceId);

  const threadsQuery = useQuery({
    enabled,
    queryFn: ({ signal }) =>
      listAppsAiThreads({
        includeArchived: input.includeArchived,
        limit: SPACE_CHATS_LIMIT,
        serviceBaseUrl,
        signal,
        spaceId,
      }),
    queryKey: appsAiThreadsListQueryKey({
      includeArchived: input.includeArchived,
      serviceBaseUrl,
      spaceId,
    }),
  });

  // The rooms the viewer may read but is not in: the thread list is by
  // participation, so those only exist in the directory.
  const directoryQuery = useRoomsDirectoryQuery(enabled ? spaceId : null);
  // Labels. Tenant-wide on purpose: a thread can outlive its agent's mount in
  // this space, and it still needs a name.
  const agentsQuery = useAiAgentsQuery(enabled);
  const agentsById = useMemo(() => {
    const map = new Map<string, SpaceChatAgentInfo>();
    for (const agent of agentsQuery.data?.agents ?? []) {
      map.set(agent.id, {
        ...(agent.avatarUrl ? { avatarUrl: agent.avatarUrl } : {}),
        engenty: agent.engenty ?? null,
        id: agent.id,
        name: agent.name?.trim() || agent.id,
      });
    }
    return map;
  }, [agentsQuery.data?.agents]);

  const threads = useMemo(
    (): AppsAiThreadRecord[] => threadsQuery.data ?? [],
    [threadsQuery.data]
  );

  const directory = directoryQuery.data;
  const rows = useMemo(
    () =>
      spaceChatRows({
        agentsById,
        ...(directory ? { directory } : {}),
        query: input.query,
        threads,
      }),
    [agentsById, directory, input.query, threads]
  );
  const groups = useMemo(
    () =>
      organizeSpaceChats({
        agentsById,
        ...(directory ? { directory } : {}),
        query: input.query,
        threads,
      }),
    [agentsById, directory, input.query, threads]
  );

  return {
    error: (threadsQuery.error as Error | null) ?? null,
    groups,
    // The agent list only decorates rows, so a slow catalog must not blank the
    // conversations — an id is a usable label while the names land.
    isLoading: enabled && threadsQuery.isLoading,
    rows,
  };
}
