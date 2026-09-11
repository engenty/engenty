import { useSpaceChats, useSpaceConversationsQuery } from "@engenty/ai-ui";
import {
  type ConversationNavItem,
  createConversationSection,
  deleteConversationSection,
  hideConversation,
  pinConversation,
  placeConversation,
  renameConversationSection,
  setConversationItemOrder,
  setConversationSectionOrder,
  setPinnedConversationOrder,
  unpinConversation,
} from "@engenty/user-settings";
import { useCallback, useMemo } from "react";
import { latestConversationByAgent } from "@/lib/space-agent-activity";
import { useSpaceConversationNav } from "@/lib/space-conversation-nav-persistence";
import {
  resolveSpaceConversationSections,
  type SpaceConversationSidebarModel,
} from "@/lib/space-conversation-sections";
import { useSpaceRosterAgents } from "@/lib/use-space-roster-agents";

/**
 * The Work tab's conversation list: what exists (roster, rooms, DMs) joined
 * with how this person filed it, plus every way of changing that. Shared by
 * Favoriten and the sections so they cannot disagree about where a row is.
 */
export function useSpaceConversationSidebar(spaceId: string | null) {
  const { agents, isPending: rosterPending } = useSpaceRosterAgents(spaceId);
  const conversationsQuery = useSpaceConversationsQuery(spaceId);
  const { rows } = useSpaceChats({ enabled: Boolean(spaceId), spaceId });
  // A desk row's activity is the desk line, not a room the agent hosts.
  const activityByAgentId = useMemo(
    () => latestConversationByAgent(rows.filter((row) => row.kind === "desk")),
    [rows]
  );
  const rooms = conversationsQuery.data?.rooms;
  const dms = conversationsQuery.data?.dms;
  const knownItems = useMemo<ConversationNavItem[]>(
    () => [
      ...agents.map((agent): ConversationNavItem => `agent:${agent.id}`),
      ...(rooms ?? []).map(
        (room): ConversationNavItem => `thread:${room.session.id}`
      ),
      ...(dms ?? []).map(
        (dm): ConversationNavItem => `thread:${dm.session.id}`
      ),
    ],
    [agents, dms, rooms]
  );
  const nav = useSpaceConversationNav({
    enabled: Boolean(spaceId),
    knownItems,
    spaceId,
  });

  const model = useMemo<SpaceConversationSidebarModel>(
    () =>
      resolveSpaceConversationSections({
        activityByAgentId,
        agents,
        dms: dms ?? [],
        rooms: rooms ?? [],
        slice: nav.slice,
      }),
    [activityByAgentId, agents, dms, nav.slice, rooms]
  );

  const { write } = nav;
  const pin = useCallback(
    (item: ConversationNavItem) =>
      write((doc, id) => pinConversation(doc, id, item)),
    [write]
  );
  const unpin = useCallback(
    (item: ConversationNavItem) =>
      write((doc, id) => unpinConversation(doc, id, item)),
    [write]
  );
  const moveTo = useCallback(
    (item: ConversationNavItem, sectionId: string | null) =>
      write((doc, id) => placeConversation(doc, id, item, sectionId)),
    [write]
  );
  const hide = useCallback(
    (item: ConversationNavItem) =>
      write((doc, id) =>
        hideConversation(doc, id, item, new Date().toISOString())
      ),
    [write]
  );
  const createSection = useCallback(
    (name: string): string => {
      const sectionId = `s_${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      write((doc, id) =>
        createConversationSection(doc, id, { id: sectionId, name })
      );
      return sectionId;
    },
    [write]
  );
  const renameSection = useCallback(
    (sectionId: string, name: string) =>
      write((doc, id) => renameConversationSection(doc, id, sectionId, name)),
    [write]
  );
  const deleteSection = useCallback(
    (sectionId: string) =>
      write((doc, id) => deleteConversationSection(doc, id, sectionId)),
    [write]
  );
  const reorderSections = useCallback(
    (sectionIds: readonly string[]) =>
      write((doc, id) => setConversationSectionOrder(doc, id, sectionIds)),
    [write]
  );
  const reorderItems = useCallback(
    (sectionId: string, items: readonly ConversationNavItem[]) =>
      write((doc, id) => setConversationItemOrder(doc, id, sectionId, items)),
    [write]
  );
  const reorderPinned = useCallback(
    (items: readonly ConversationNavItem[]) =>
      write((doc, id) => setPinnedConversationOrder(doc, id, items)),
    [write]
  );

  return {
    createSection,
    deleteSection,
    hide,
    isPending: rosterPending || conversationsQuery.isPending || nav.isPending,
    model,
    moveTo,
    /** The personal sections, for the "move to" menu. */
    personalSections: nav.slice.sections,
    pin,
    renameSection,
    reorderItems,
    reorderPinned,
    reorderSections,
    unpin,
  };
}
