import { describe, expect, it } from "vitest";
import {
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
