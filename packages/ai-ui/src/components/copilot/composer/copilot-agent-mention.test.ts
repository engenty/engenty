import { describe, expect, it } from "vitest";
import {
  agentIdToMentionHandle,
  buildMentionAgentCandidates,
  getMentionQueryAtCursor,
  stripLeadingMentionToken,
} from "./copilot-agent-mention.js";

describe("getMentionQueryAtCursor", () => {
  it("returns null when no @ before cursor", () => {
    expect(getMentionQueryAtCursor("hello", 5)).toBeNull();
  });

  it("returns query for open mention", () => {
    expect(getMentionQueryAtCursor("hi @cont", 8)).toEqual({
      atIndex: 3,
      query: "cont",
    });
  });

  it("returns null when mention already closed with space", () => {
    expect(getMentionQueryAtCursor("hi @a b", 7)).toBeNull();
  });

  it("returns null when @ is part of a word", () => {
    expect(getMentionQueryAtCursor("foo@bar", 7)).toBeNull();
  });
});

describe("agentIdToMentionHandle", () => {
  it("replaces dots with hyphens", () => {
    expect(agentIdToMentionHandle("contacts.manager")).toBe("contacts-manager");
    expect(agentIdToMentionHandle("engenty.copilot")).toBe("engenty-copilot");
  });
});

describe("buildMentionAgentCandidates", () => {
  it("maps ids to handles and filters inactive / non-mentionable agents", () => {
    const candidates = buildMentionAgentCandidates([
      { id: "contacts.manager", name: "Contacts" },
      {
        chat_triggers: {
          include_in_chat_picker: true,
          is_active: false,
          mention_routing_enabled: true,
        },
        id: "offers.manager",
        name: "Offers",
      },
      {
        chat_triggers: {
          include_in_chat_picker: true,
          is_active: true,
          mention_routing_enabled: false,
        },
        id: "inbox.manager",
        name: "Inbox",
      },
      {
        chat_triggers: {
          include_in_chat_picker: false,
          is_active: true,
          mention_routing_enabled: true,
        },
        id: "tasks.manager",
        name: "Tasks",
      },
    ]);
    expect(candidates).toEqual([
      { handle: "contacts-manager", id: "contacts.manager", name: "Contacts" },
    ]);
  });
});

describe("stripLeadingMentionToken", () => {
  const candidates = [
    { handle: "contacts-manager", id: "contacts.manager" },
    { handle: "a", id: "agent_a" },
  ];

  it("strips longest matching handle", () => {
    expect(
      stripLeadingMentionToken("@contacts-manager hello", candidates)
    ).toEqual({
      requestedAgentId: "contacts.manager",
      text: "hello",
    });
  });

  it("returns full trim when no match", () => {
    expect(stripLeadingMentionToken("@unknown x", candidates)).toEqual({
      text: "@unknown x",
    });
  });
});
