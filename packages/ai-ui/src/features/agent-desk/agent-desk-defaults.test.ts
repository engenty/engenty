import type {
  AgentDeskAgent,
  AgentDeskEngagement,
} from "@engenty/ai-core/browser";
import { describe, expect, it } from "vitest";
import {
  canManageAgent,
  resolveAgentDeskDefault,
} from "./agent-desk-defaults.js";

const agent: AgentDeskAgent = {
  can_assign_work: true,
  can_ask: true,
  connectors: [],
  description: null,
  engenty: "drop",
  id: "custom.researcher",
  managed_by_module: null,
  model: "openai/gpt-5.6",
  name: "Researcher",
  role: "specialist",
  skills: [],
  source: "database",
  starters: [],
};

const conversation: AgentDeskEngagement = {
  href: "/conversation",
  id: "conversation:1",
  kind: "conversation",
  lane: "conversation",
  metadata: {},
  sort_at: "2026-08-18T12:00:00.000Z",
  status: "idle",
  subtitle: null,
  title: "Conversation",
};

describe("resolveAgentDeskDefault", () => {
  it("opens a coordinator-role agent on a conversation, same as any other askable agent", () => {
    expect(
      resolveAgentDeskDefault({
        agent: { ...agent, id: "engenty.coordinator", role: "coordinator" },
        engagements: [conversation],
      })
    ).toEqual({ engagement: conversation, kind: "conversation" });
    expect(
      resolveAgentDeskDefault({
        agent: { ...agent, id: "engenty.coordinator", role: "coordinator" },
        engagements: [],
      })
    ).toEqual({ engagement: null, kind: "conversation" });
  });

  it("binds Copilot to its newest conversation or a new one", () => {
    const newerCompletedConversation: AgentDeskEngagement = {
      ...conversation,
      id: "conversation:2",
      lane: "completed",
      sort_at: "2026-08-18T13:00:00.000Z",
      status: "completed",
    };
    expect(
      resolveAgentDeskDefault({
        agent: { ...agent, role: "copilot" },
        engagements: [conversation, newerCompletedConversation],
      })
    ).toEqual({
      engagement: newerCompletedConversation,
      kind: "conversation",
    });
    expect(
      resolveAgentDeskDefault({
        agent: { ...agent, role: "copilot" },
        engagements: [],
      })
    ).toEqual({ engagement: null, kind: "conversation" });
  });

  it("binds specialists to their newest conversation or a new one", () => {
    expect(
      resolveAgentDeskDefault({ agent, engagements: [conversation] })
    ).toEqual({ engagement: conversation, kind: "conversation" });
    expect(resolveAgentDeskDefault({ agent, engagements: [] })).toEqual({
      engagement: null,
      kind: "conversation",
    });
  });

  it("never lands the chat on a routine fire, however recent", () => {
    // A fire that has written nothing yet is a BLANK chat — which is what
    // switching tabs used to drop you into, because leaving a tab clears the
    // open conversation and the newest thread was the machine's.
    const fire: AgentDeskEngagement = {
      ...conversation,
      id: "conversation:fire",
      metadata: { routine_id: "01a03ab6-0376-766f-9fe2-82ac0f86e28d" },
      sort_at: "2026-08-18T14:00:00.000Z",
      title: "Stock quotes every 10 minutes",
    };
    expect(
      resolveAgentDeskDefault({ agent, engagements: [conversation, fire] })
    ).toEqual({ engagement: conversation, kind: "conversation" });
    // Only fires: a new chat, not somebody else's run.
    expect(resolveAgentDeskDefault({ agent, engagements: [fire] })).toEqual({
      engagement: null,
      kind: "conversation",
    });
  });

  it("never lands on a room or a DM: the sidebar opens those by name", () => {
    const room: AgentDeskEngagement = {
      ...conversation,
      id: "conversation:room",
      metadata: { room: true },
      sort_at: "2026-08-18T15:00:00.000Z",
    };
    const dm: AgentDeskEngagement = {
      ...conversation,
      id: "conversation:dm",
      metadata: { dm: true },
      sort_at: "2026-08-18T16:00:00.000Z",
    };
    expect(
      resolveAgentDeskDefault({ agent, engagements: [conversation, room, dm] })
    ).toEqual({ engagement: conversation, kind: "conversation" });
    expect(resolveAgentDeskDefault({ agent, engagements: [room, dm] })).toEqual(
      { engagement: null, kind: "conversation" }
    );
  });

  it("keeps a desk list only for agents that cannot be asked", () => {
    expect(
      resolveAgentDeskDefault({
        agent: { ...agent, can_ask: false, role: "external" },
        engagements: [conversation],
      })
    ).toEqual({ engagement: conversation, kind: "desk" });
  });
});

describe("canManageAgent", () => {
  it("allows only tenant-owned database agents", () => {
    expect(canManageAgent(agent)).toBe(true);
    expect(canManageAgent({ ...agent, managed_by_module: "chatbot" })).toBe(
      false
    );
    expect(canManageAgent({ ...agent, source: "module" })).toBe(false);
  });
});
