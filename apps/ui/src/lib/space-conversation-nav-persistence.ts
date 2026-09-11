import { queryOptions, useQuery, useQueryClient } from "@engenty/query-client";
import {
  agentNavForSpace,
  type ConversationNavItem,
  conversationNavForSpace,
  emptySpacesConversationNavDocument,
  foldAgentNavIntoConversationNav,
  parseSpacesAgentNavDocument,
  parseSpacesConversationNavDocument,
  pruneSpacesConversationNav,
  SPACES_AGENT_NAV_SETTING_KEY,
  SPACES_CONVERSATION_NAV_SETTING_KEY,
  type SpacesConversationNavDocument,
  type SpacesConversationNavSpace,
} from "@engenty/user-settings";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getUserSetting, setUserSetting } from "@/lib/api/client";

/**
 * One person's organisation of a Space's sidebar
 * (`shell.spaces.conversation_nav.v1`): sections, placements, pins, manual
 * orders, hidden rows. Nothing in it grants or restricts who may read a
 * thread; it is where the rows sit for this person.
 *
 * Follows `spaces-recent-persistence`: optimistic write into the query cache,
 * debounced PATCH. Every mutation goes through one `write`, which prunes the
 * document against the rows that exist so a room archived elsewhere or an
 * agent unmounted does not linger in a section for ever.
 *
 * The older agent-only document (`shell.spaces.agent_nav.v1`: pinned agents
 * and their order) is folded in once per Space, the first time this document
 * has nothing for it.
 */
const conversationNavQueryKey = [
  "user-settings",
  SPACES_CONVERSATION_NAV_SETTING_KEY,
] as const;

const conversationNavQueryOptions = queryOptions({
  queryFn: async ({
    signal,
  }): Promise<SpacesConversationNavDocument | null> => {
    const res = await getUserSetting(
      SPACES_CONVERSATION_NAV_SETTING_KEY,
      signal
    );
    if (!res || "error" in res) {
      return null;
    }
    if (res.type === "json" && res.value != null) {
      return parseSpacesConversationNavDocument(res.value);
    }
    return null;
  },
  queryKey: conversationNavQueryKey,
});

const agentNavQueryOptions = queryOptions({
  queryFn: async ({ signal }) => {
    const res = await getUserSetting(SPACES_AGENT_NAV_SETTING_KEY, signal);
    if (!res || "error" in res) {
      return null;
    }
    if (res.type === "json" && res.value != null) {
      return parseSpacesAgentNavDocument(res.value);
    }
    return null;
  },
  queryKey: ["user-settings", SPACES_AGENT_NAV_SETTING_KEY] as const,
});

export type ConversationNavMutation = (
  doc: SpacesConversationNavDocument,
  spaceId: string
) => SpacesConversationNavDocument;

export function useSpaceConversationNav(options: {
  enabled: boolean;
  /** Every row that exists right now; the document is pruned to these. */
  knownItems: readonly ConversationNavItem[];
  spaceId: string | null;
}): {
  isPending: boolean;
  slice: SpacesConversationNavSpace;
  write: (mutate: ConversationNavMutation) => void;
} {
  const queryClient = useQueryClient();
  const enabled = options.enabled && Boolean(options.spaceId);
  const query = useQuery({ ...conversationNavQueryOptions, enabled });
  const legacyQuery = useQuery({ ...agentNavQueryOptions, enabled });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownItemsRef = useRef(options.knownItems);
  knownItemsRef.current = options.knownItems;

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    []
  );

  const persistSoon = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const latest =
        queryClient.getQueryData<SpacesConversationNavDocument | null>(
          conversationNavQueryKey
        ) ?? emptySpacesConversationNavDocument();
      void setUserSetting(SPACES_CONVERSATION_NAV_SETTING_KEY, {
        type: "json",
        value_jsonb: latest,
      });
    }, 500);
  }, [queryClient]);

  const write = useCallback(
    (mutate: ConversationNavMutation): void => {
      if (!options.spaceId) {
        return;
      }
      const spaceId = options.spaceId;
      let changed = false;
      queryClient.setQueryData(
        conversationNavQueryKey,
        (prev: SpacesConversationNavDocument | null | undefined) => {
          const base = prev ?? emptySpacesConversationNavDocument();
          const next = pruneSpacesConversationNav(
            mutate(base, spaceId),
            spaceId,
            knownItemsRef.current
          );
          changed = next !== base;
          return next;
        }
      );
      if (changed) {
        persistSoon();
      }
    },
    [options.spaceId, persistSoon, queryClient]
  );

  // The one-time fold of the agent-only document, for a Space this document
  // knows nothing about yet. Runs once both settings have loaded.
  const folded = useRef(new Set<string>());
  useEffect(() => {
    const spaceId = options.spaceId;
    if (
      !(spaceId && enabled) ||
      query.isPending ||
      legacyQuery.isPending ||
      folded.current.has(spaceId)
    ) {
      return;
    }
    folded.current.add(spaceId);
    const legacy = legacyQuery.data;
    if (!legacy) {
      return;
    }
    const agentNav = agentNavForSpace(legacy, spaceId);
    if (agentNav.pinned.length === 0 && agentNav.order.length === 0) {
      return;
    }
    write((doc, id) => foldAgentNavIntoConversationNav(doc, id, agentNav));
  }, [
    enabled,
    legacyQuery.data,
    legacyQuery.isPending,
    options.spaceId,
    query.isPending,
    write,
  ]);

  const slice = useMemo(
    () =>
      conversationNavForSpace(
        query.data ?? emptySpacesConversationNavDocument(),
        options.spaceId ?? ""
      ),
    [options.spaceId, query.data]
  );

  return { isPending: enabled && query.isPending, slice, write };
}
