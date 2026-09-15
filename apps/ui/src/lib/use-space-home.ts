/**
 * The Space home's model: the sidebar's rows, the server's states, and the
 * cursor that decides what counts as "done since you last looked".
 *
 * The cursor is read ONCE per visit and held still while the page is open — a
 * cursor that moved with every refetch would clear the done cards the moment
 * you glanced at them (PLAN-space-home.md §6 open question 2). It is written
 * back when the page goes away, so the next visit starts where this one ended.
 */
import { useSpaceHomeQuery } from "@engenty/ai-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  resolveSpaceHomeCards,
  type SpaceHomeCardsModel,
} from "@/lib/space-home-cards";
import { useSpaceConversationSidebar } from "@/lib/use-space-conversation-sidebar";

function cursorKey(spaceId: string): string {
  return `engenty:space-home:${spaceId}:seen-at`;
}

function readCursor(spaceId: string | null): string | null {
  if (!spaceId || typeof localStorage === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(cursorKey(spaceId));
  } catch {
    return null;
  }
}

function writeCursor(spaceId: string, cursor: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(cursorKey(spaceId), cursor);
  } catch {
    // private mode / quota — the page then reports the last day, which is the
    // same answer a first visit gets.
  }
}

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
  const [since, setSince] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  // The cursor is per space: switching spaces re-reads it, then freezes again.
  useEffect(() => {
    setSince(readCursor(spaceId));
    setPinned(Boolean(spaceId));
  }, [spaceId]);

  const homeQuery = useSpaceHomeQuery({
    enabled: pinned,
    since,
    spaceId,
  });
  const sidebar = useSpaceConversationSidebar(spaceId);

  // Written on the way out, from the newest answer this visit received.
  const latestCursor = useRef<string | null>(null);
  latestCursor.current = homeQuery.data?.cursor ?? latestCursor.current;
  useEffect(() => {
    if (!spaceId) {
      return;
    }
    return () => {
      if (latestCursor.current) {
        writeCursor(spaceId, latestCursor.current);
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
