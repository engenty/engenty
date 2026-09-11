/**
 * The home's card list, from the sidebar's own model plus the server's states
 * (PLAN-space-home.md H1–H4).
 *
 * The page is the sidebar unfolded: the order here is the sidebar's order —
 * Favoriten, then the personal sections, then the built-ins — and never a
 * ranking of its own. What the home adds is the cut: a pinned row always has a
 * card, an unpinned one only while it is live, and everything else collapses
 * into a single line. Pure, so the rule is testable without a server.
 */
import type {
  SpaceHomeJob,
  SpaceHomeLastMessage,
  SpaceHomeState,
  SpaceHomeThread,
} from "@engenty/ai-ui";
import type {
  SpaceConversationItem,
  SpaceConversationSidebarModel,
} from "@/lib/space-conversation-sections";

const STATE_RANK: Record<SpaceHomeState, number> = {
  waiting: 0,
  paused: 1,
  running: 2,
  done: 3,
  quiet: 4,
};

/**
 * How many live jobs a card draws before it starts counting instead. Three is
 * what a person reads at a glance; a desk with eight parallel runs is a list
 * to open, not a card to skim.
 */
const MAX_JOBS = 3;

export interface SpaceHomeCard {
  /** The room's turn count, for the pause line. Zero elsewhere. */
  agentTurns: number;
  /**
   * Runs that ENDED since the last visit, as a number. Eight identical
   * "finished" rows say nothing eight times; the count plus a way in says it
   * once.
   */
  doneCount: number;
  /** Live jobs past {@link MAX_JOBS}, counted rather than drawn. */
  hiddenJobs: number;
  item: SpaceConversationItem;
  /** The jobs still going or still stuck, most urgent first (H4). */
  jobs: SpaceHomeJob[];
  /** The newest thing said here, whichever of this row's threads said it. */
  lastMessage: SpaceHomeLastMessage | null;
  pinned: boolean;
  state: SpaceHomeState;
  /** The thread a verdict or a message goes to. Null for a desk with no thread yet. */
  threadId: string | null;
}

export interface SpaceHomeCardsModel {
  cards: SpaceHomeCard[];
  /** Rows with nothing live and no pin: named in one line, not drawn. */
  quiet: SpaceConversationItem[];
}

function mostUrgent(states: readonly SpaceHomeState[]): SpaceHomeState {
  return states.toSorted((a, b) => STATE_RANK[a] - STATE_RANK[b])[0] ?? "quiet";
}

/**
 * The states that speak for one sidebar row.
 *
 * A desk is its agent's work in this Space — the shared desk thread AND the
 * routine fires nobody owns, which is why an agent, not a thread, is the key
 * there. A room and a DM are one thread each.
 */
function statesFor(
  item: SpaceConversationItem,
  byThread: ReadonlyMap<string, SpaceHomeThread>,
  byAgent: ReadonlyMap<string, SpaceHomeThread[]>
): SpaceHomeThread[] {
  if (item.kind === "desk") {
    return byAgent.get(item.agent.id) ?? [];
  }
  const threadId =
    item.kind === "room" ? item.room.session.id : item.dm.session.id;
  const state = byThread.get(threadId);
  return state ? [state] : [];
}

function threadIdOf(
  item: SpaceConversationItem,
  states: readonly SpaceHomeThread[]
): string | null {
  if (item.kind === "room") {
    return item.room.session.id;
  }
  if (item.kind === "dm") {
    return item.dm.session.id;
  }
  // A desk's own thread hosts the conversation; an unattended run thread is
  // work shown ON that desk, never a place to write. Prefer the former.
  const own = states.find((state) => state.kind === "desk" && !state.paused);
  return own?.thread_id ?? states[0]?.thread_id ?? null;
}

export function resolveSpaceHomeCards(input: {
  sidebar: SpaceConversationSidebarModel;
  threads: readonly SpaceHomeThread[];
}): SpaceHomeCardsModel {
  const byThread = new Map(
    input.threads.map((thread) => [thread.thread_id, thread] as const)
  );
  const byAgent = new Map<string, SpaceHomeThread[]>();
  for (const thread of input.threads) {
    if (thread.kind !== "desk") {
      continue;
    }
    const list = byAgent.get(thread.agent_id) ?? [];
    list.push(thread);
    byAgent.set(thread.agent_id, list);
  }

  const ordered: { item: SpaceConversationItem; pinned: boolean }[] = [
    ...input.sidebar.favorites.map((item) => ({ item, pinned: true })),
    ...input.sidebar.sections.flatMap((section) =>
      section.items.map((item) => ({ item, pinned: false }))
    ),
  ];

  const cards: SpaceHomeCard[] = [];
  const quiet: SpaceConversationItem[] = [];
  for (const { item, pinned } of ordered) {
    const states = statesFor(item, byThread, byAgent);
    const allJobs = states
      .flatMap((state) => state.jobs)
      .toSorted(
        (left, right) => STATE_RANK[left.state] - STATE_RANK[right.state]
      );
    const live = allJobs.filter((job) => job.state !== "done");
    const doneCount = allJobs.length - live.length;
    const state = mostUrgent(states.map((entry) => entry.state));
    if (state === "quiet" && !pinned) {
      quiet.push(item);
      continue;
    }
    const lastMessage = states
      .map((entry) => entry.last_message)
      .filter((message): message is SpaceHomeLastMessage => Boolean(message))
      .toSorted((left, right) => (left.at < right.at ? 1 : -1))[0];
    cards.push({
      agentTurns: Math.max(0, ...states.map((entry) => entry.agent_turns), 0),
      doneCount,
      hiddenJobs: Math.max(0, live.length - MAX_JOBS),
      item,
      jobs: live.slice(0, MAX_JOBS),
      lastMessage: lastMessage ?? null,
      pinned,
      state,
      threadId: threadIdOf(item, states),
    });
  }
  return { cards, quiet };
}
