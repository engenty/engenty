import type { SpaceDmRow, SpaceHomeThread, SpaceRoomRow } from "@engenty/ai-ui";
import {
  type ConversationNavItem,
  emptySpacesConversationNavSpace,
} from "@engenty/user-settings";
import { describe, expect, it } from "vitest";
import { resolveSpaceConversationSections } from "./space-conversation-sections";
import { resolveSpaceHomeCards } from "./space-home-cards";
import type { SpaceRosterAgent } from "./use-space-roster-agents";

const agent = (id: string, name: string): SpaceRosterAgent => ({
  engenty: "round",
  id,
  name,
  skillIds: [],
});

const room = (id: string): SpaceRoomRow => ({
  members: [{ agent_id: "tim", role: "host" }],
  session: {
    agent_id: "tim",
    created_by_user_id: "me",
    id,
    space_id: "space-1",
    title: "Gaming Room",
    updated_at: "2026-09-09T07:00:00Z",
    visibility: "space",
  },
});

const dm = (id: string, agentId: string): SpaceDmRow => ({
  agent_id: agentId,
  session: {
    agent_id: agentId,
    created_by_user_id: "me",
    id,
    space_id: "space-1",
    title: null,
    updated_at: "2026-09-09T07:00:00Z",
    visibility: "private",
  },
});

const state = (overrides: Partial<SpaceHomeThread>): SpaceHomeThread => ({
  agent_id: "tom",
  agent_turns: 0,
  awaiting_first_reply: false,
  jobs: [],
  kind: "desk",
  last_message: null,
  paused: false,
  state: "quiet",
  thread_id: "t-desk",
  title: null,
  updated_at: "2026-09-09T07:00:00Z",
  ...overrides,
});

const job = (
  state: SpaceHomeThread["state"]
): SpaceHomeThread["jobs"][number] => ({
  app_release: null,
  finished_at: null,
  interrupt: null,
  run_id: "r1",
  started_at: "2026-09-09T07:00:00Z",
  state,
  trigger: "message",
});

function withPinned(...pinned: ConversationNavItem[]) {
  return { ...emptySpacesConversationNavSpace(), pinned };
}

function sidebar(slice = emptySpacesConversationNavSpace()) {
  return resolveSpaceConversationSections({
    activityByAgentId: new Map(),
    agents: [agent("tom", "Tom"), agent("tim", "Tim")],
    dms: [dm("t-dm", "tom")],
    rooms: [room("t-room")],
    slice,
  });
}

describe("resolveSpaceHomeCards", () => {
  it("leaves the river to the sidebar — the home lists what happens here", () => {
    const river = dm("t-river", "engenty.copilot");
    river.session.space_id = null;
    const model = resolveSpaceHomeCards({
      sidebar: resolveSpaceConversationSections({
        activityByAgentId: new Map(),
        agents: [agent("tom", "Tom")],
        dms: [river, dm("t-dm", "tom")],
        rooms: [],
        slice: emptySpacesConversationNavSpace(),
      }),
      threads: [],
    });
    const keys = [
      ...model.cards.map((card) => card.item.key),
      ...model.quiet.map((item) => item.key),
    ];
    expect(keys).not.toContain("thread:t-river");
    expect(keys).toContain("thread:t-dm");
  });

  it("collapses every quiet, unpinned row into the line", () => {
    const model = resolveSpaceHomeCards({ sidebar: sidebar(), threads: [] });
    expect(model.cards).toEqual([]);
    expect(model.quiet).toHaveLength(4);
  });

  it("keeps a pinned row as a card even when nothing is live", () => {
    const model = resolveSpaceHomeCards({
      sidebar: sidebar(withPinned("agent:tom")),
      threads: [],
    });
    expect(model.cards).toHaveLength(1);
    expect(model.cards[0]).toMatchObject({ pinned: true, state: "quiet" });
    expect(model.quiet).toHaveLength(3);
  });

  it("draws an unpinned row once it is live", () => {
    const model = resolveSpaceHomeCards({
      sidebar: sidebar(),
      threads: [
        state({ agent_id: "tom", jobs: [job("running")], state: "running" }),
      ],
    });
    expect(model.cards).toHaveLength(1);
    expect(model.cards[0]?.state).toBe("running");
  });

  it("keeps a quiet hire that is still waiting for a first reply", () => {
    const model = resolveSpaceHomeCards({
      sidebar: sidebar(),
      threads: [
        state({
          agent_id: "tom",
          awaiting_first_reply: true,
          last_message: {
            at: "2026-09-09T07:00:00Z",
            excerpt: "Hi — I'm Tom.",
            role: "assistant",
          },
        }),
      ],
    });
    expect(model.cards).toHaveLength(1);
    expect(model.cards[0]?.lastMessage?.excerpt).toContain("Tom");
    expect(model.quiet.map((item) => item.key)).not.toContain("agent:tom");
  });

  it("gathers a desk's parallel jobs onto one card, most urgent first", () => {
    const model = resolveSpaceHomeCards({
      sidebar: sidebar(),
      threads: [
        state({ agent_id: "tom", jobs: [job("running")], state: "running" }),
        state({
          agent_id: "tom",
          jobs: [job("waiting")],
          state: "waiting",
          thread_id: "t-routine",
        }),
      ],
    });
    expect(model.cards).toHaveLength(1);
    expect(model.cards[0]?.state).toBe("waiting");
    expect(model.cards[0]?.jobs.map((entry) => entry.state)).toEqual([
      "waiting",
      "running",
    ]);
  });

  it("counts finished runs instead of drawing one row each", () => {
    const model = resolveSpaceHomeCards({
      sidebar: sidebar(),
      threads: [
        state({
          agent_id: "tom",
          jobs: [job("done"), job("done"), job("running")],
          state: "running",
        }),
      ],
    });
    expect(model.cards[0]?.jobs.map((entry) => entry.state)).toEqual([
      "running",
    ]);
    expect(model.cards[0]?.doneCount).toBe(2);
  });

  it("caps the live rows and counts the rest", () => {
    const model = resolveSpaceHomeCards({
      sidebar: sidebar(),
      threads: [
        state({
          agent_id: "tom",
          jobs: [
            job("running"),
            job("running"),
            job("running"),
            job("running"),
          ],
          state: "running",
        }),
      ],
    });
    expect(model.cards[0]?.jobs).toHaveLength(3);
    expect(model.cards[0]?.hiddenJobs).toBe(1);
  });

  it("carries a room's pause and its turn count", () => {
    const model = resolveSpaceHomeCards({
      sidebar: sidebar(),
      threads: [
        state({
          agent_turns: 12,
          jobs: [job("paused")],
          kind: "room",
          paused: true,
          state: "paused",
          thread_id: "t-room",
        }),
      ],
    });
    expect(model.cards[0]).toMatchObject({
      agentTurns: 12,
      state: "paused",
      threadId: "t-room",
    });
  });

  it("orders cards the way the sidebar orders rows — pinned first", () => {
    const slice = withPinned("thread:t-room");
    const model = resolveSpaceHomeCards({
      sidebar: sidebar(slice),
      threads: [
        state({ agent_id: "tom", jobs: [job("running")], state: "running" }),
      ],
    });
    expect(model.cards.map((card) => card.item.key)).toEqual([
      "thread:t-room",
      "agent:tom",
    ]);
  });
});
