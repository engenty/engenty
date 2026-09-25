/**
 * The Space home's model: the sidebar's rows, the server's states, and the
 * cursor that decides what counts as "done since you last looked".
 *
 * The cursor is read ONCE per visit and held still while the page is open — a
 * cursor that moved with every refetch would clear the done cards the moment
 * you glanced at them (PLAN-space-home.md §6 open question 2). It is written
 * back when the page goes away, so the next visit starts where this one ended.
 *
 * A space switch starts a new visit on the same render. Reading the cursor in
 * an effect would fire `/ai/spaces/<id>/home` with the previous space's `since`.
 */
import { useSpaceHomeQuery } from "@engenty/ai-ui";
import { useEffect, useMemo, useRef } from "react";
import {
  resolveSpaceHomeCards,
  type SpaceHomeCardsModel,
} from "@/lib/space-home-cards";
import {
  holdSpaceHomeVisit,
  type SpaceHomeVisit,
  writeSpaceHomeCursor,
} from "@/lib/space-home-visit";
import { useSpaceConversationSidebar } from "@/lib/use-space-conversation-sidebar";

export interface UseSpaceHomeResult extends SpaceHomeCardsModel {
  isPending: boolean;
  /** What the cards are measured against; null before the first read. */
  since: string | null;
  /**
   * Agents with a desk conversation in this Space — spoken to, or that spoke.
   * From the threads themselves, not from which cards happen to be showing: a
   * quiet desk has no card but is not silent.
   */
  spokenAgentIds: ReadonlySet<string>;
}

export function useSpaceHome(spaceId: string | null): UseSpaceHomeResult {
  const visitRef = useRef<SpaceHomeVisit | null>(null);
  visitRef.current = holdSpaceHomeVisit(spaceId, visitRef.current);
  const since = visitRef.current.since;

  const homeQuery = useSpaceHomeQuery({
    enabled: Boolean(spaceId),
    since,
    spaceId,
  });
  const sidebar = useSpaceConversationSidebar(spaceId);

  // Written on the way out, keyed by the space that produced the cursor so a
  // switch cannot store the new space's answer under the previous space.
  const latestCursorBySpace = useRef(new Map<string, string>());
  if (spaceId && homeQuery.data?.cursor) {
    latestCursorBySpace.current.set(spaceId, homeQuery.data.cursor);
  }
  useEffect(() => {
    if (!spaceId) {
      return;
    }
    return () => {
      const cursor = latestCursorBySpace.current.get(spaceId);
      if (cursor) {
        writeSpaceHomeCursor(spaceId, cursor);
      }
    };
  }, [spaceId]);

  const model = useMemo(
    () =>
      resolveSpaceHomeCards({
        sidebar: sidebar.model,
        threads: homeQuery.data?.threads ?? [],
      }),
    [homeQuery.data?.threads, sidebar.model]
  );

  const spokenAgentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const thread of homeQuery.data?.threads ?? []) {
      if (thread.kind === "desk") {
        ids.add(thread.agent_id);
      }
    }
    return ids;
  }, [homeQuery.data?.threads]);

  return {
    ...model,
    isPending: homeQuery.isPending || sidebar.isPending,
    since,
    spokenAgentIds,
  };
}
