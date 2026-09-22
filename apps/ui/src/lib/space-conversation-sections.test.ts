import type { SpaceDmRow, SpaceRoomRow } from "@engenty/ai-ui";
import { emptySpacesConversationNavSpace } from "@engenty/user-settings";
import { describe, expect, it } from "vitest";
import {
  isRiverItem,
  resolveSpaceConversationSections,
} from "./space-conversation-sections";
import type { SpaceRosterAgent } from "./use-space-roster-agents";

const agent = (id: string, name: string): SpaceRosterAgent => ({
  engenty: "round",
  id,
  name,
  skillIds: [],
});

const room = (id: string, updatedAt: string): SpaceRoomRow => ({
  members: [{ agent_id: "tim", role: "host" }],
  session: {
    agent_id: "tim",
    created_by_user_id: "me",
    id,
    space_id: "space-1",
    title: id,
    updated_at: updatedAt,
    visibility: "space",
  },
});

const dm = (
  id: string,
  agentId: string,
  updatedAt: string,
  spaceId: string | null = "space-1"
): SpaceDmRow => ({
  agent_id: agentId,
  session: {
    agent_id: agentId,
    created_by_user_id: "me",
    id,
    space_id: spaceId,
    title: null,
    updated_at: updatedAt,
    visibility: "private",
  },
});

/** The river: the copilot's DM, which has no space. */
const river = (updatedAt: string) =>
  dm("river", "engenty.copilot", updatedAt, null);

const roster = [
  agent("tom", "Tom"),
  agent("anna", "Anna"),
  agent("tim", "Tim"),
];

describe("resolveSpaceConversationSections", () => {
  it("files every row into the built-in of its kind, desks by name, the rest by activity", () => {
    const model = resolveSpaceConversationSections({
      activityByAgentId: new Map(),
      agents: roster,
      dms: [dm("d1", "tom", "2026-09-01T00:00:00Z")],
      rooms: [
        room("older", "2026-09-01T00:00:00Z"),
        room("newer", "2026-09-02T00:00:00Z"),
      ],
      slice: emptySpacesConversationNavSpace(),
    });
    expect(model.favorites).toEqual([]);
    expect(model.sections.map((section) => section.id)).toEqual([
      "agents",
      "rooms",
      "dms",
    ]);
    expect(model.sections[0]?.items.map((item) => item.key)).toEqual([
      "agent:anna",
      "agent:tim",
      "agent:tom",
    ]);
    expect(model.sections[1]?.items.map((item) => item.key)).toEqual([
      "thread:newer",
      "thread:older",
    ]);
    expect(model.sections[2]?.items.map((item) => item.key)).toEqual([
      "thread:d1",
    ]);
    expect(model.knownItems).toHaveLength(6);
  });

  it("a pinned row is in Favoriten and nowhere else; a filed row leaves its built-in", () => {
    const model = resolveSpaceConversationSections({
      activityByAgentId: new Map(),
      agents: roster,
      dms: [],
      rooms: [room("r1", "2026-09-01T00:00:00Z")],
      slice: {
        ...emptySpacesConversationNavSpace(),
        order: ["launch", "agents", "rooms", "dms"],
        pinned: ["agent:tom"],
        placement: { "agent:tim": "launch", "thread:r1": "launch" },
        sections: [{ id: "launch", name: "Launch" }],
      },
    });
    expect(model.favorites.map((item) => item.key)).toEqual(["agent:tom"]);
    expect(model.sections.map((section) => [section.id, section.kind])).toEqual(
      [
        ["launch", "personal"],
        ["agents", "agents"],
        ["rooms", "rooms"],
        ["dms", "dms"],
      ]
    );
    expect(model.sections[0]?.name).toBe("Launch");
    expect(model.sections[0]?.items.map((item) => item.key)).toEqual([
      "thread:r1",
      "agent:tim",
    ]);
    expect(model.sections[1]?.items.map((item) => item.key)).toEqual([
      "agent:anna",
    ]);
    expect(model.sections[2]?.items).toEqual([]);
  });

  it("a manual order comes first, the rest follow the section's sort", () => {
    const model = resolveSpaceConversationSections({
      activityByAgentId: new Map(),
      agents: roster,
      dms: [],
      rooms: [],
      slice: {
        ...emptySpacesConversationNavSpace(),
        itemOrder: { agents: ["agent:tom", "agent:gone"] },
      },
    });
    expect(model.sections[0]?.items.map((item) => item.key)).toEqual([
      "agent:tom",
      "agent:anna",
      "agent:tim",
    ]);
  });

  it("a hidden room stays out until it moves again; a desk never hides", () => {
    const slice = {
      ...emptySpacesConversationNavSpace(),
      hidden: {
        "agent:tom": "2026-09-05T00:00:00Z",
        "thread:quiet": "2026-09-05T00:00:00Z",
        "thread:loud": "2026-09-05T00:00:00Z",
      },
    };
    const model = resolveSpaceConversationSections({
      activityByAgentId: new Map(),
      agents: roster,
      dms: [],
      rooms: [
        room("quiet", "2026-09-04T00:00:00Z"),
        room("loud", "2026-09-06T00:00:00Z"),
      ],
      slice,
    });
    expect(model.sections[0]?.items.map((item) => item.key)).toContain(
      "agent:tom"
    );
    expect(model.sections[1]?.items.map((item) => item.key)).toEqual([
      "thread:loud",
    ]);
  });

  it("the river heads Privat whatever its activity, and never hides", () => {
    const slice = {
      ...emptySpacesConversationNavSpace(),
      hidden: { "thread:river": "2026-09-05T00:00:00Z" },
    };
    const model = resolveSpaceConversationSections({
      activityByAgentId: new Map(),
      agents: roster,
      dms: [
        dm("busy", "tom", "2026-09-09T00:00:00Z"),
        river("2026-09-01T00:00:00Z"),
      ],
      rooms: [],
      slice,
    });
    const dms = model.sections.find((section) => section.id === "dms");
    expect(dms?.items.map((item) => item.key)).toEqual([
      "thread:river",
      "thread:busy",
    ]);
    expect(dms?.items.map(isRiverItem)).toEqual([true, false]);
  });

  it("a placement into a section that no longer exists falls back to the kind", () => {
    const model = resolveSpaceConversationSections({
      activityByAgentId: new Map(),
      agents: roster,
      dms: [],
      rooms: [],
      slice: {
        ...emptySpacesConversationNavSpace(),
        placement: { "agent:tom": "deleted" },
      },
    });
    expect(model.sections[0]?.items.map((item) => item.key)).toContain(
      "agent:tom"
    );
  });
});
