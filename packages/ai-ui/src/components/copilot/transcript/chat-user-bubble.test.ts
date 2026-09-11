import { describe, expect, it } from "vitest";
import {
  chatBubbleCluster,
  chatMessageStackClassName,
  chatSpeakerKey,
  chatUserBubbleClassName,
  isLongInlineToken,
  softenUserInlineCode,
} from "./chat-user-bubble.js";

describe("chatSpeakerKey", () => {
  it("clusters ordinary user turns together", () => {
    expect(
      chatSpeakerKey({ role: "user", parts: [{ type: "text", text: "hi" }] })
    ).toBe("user");
  });

  it("keeps colleague turns on the sender id", () => {
    expect(
      chatSpeakerKey({
        role: "user",
        parts: [
          {
            type: "text",
            text: "**Message from Brain** (engenty `brain`)\n\nAlready approved",
          },
        ],
      })
    ).toBe("agent:brain");
  });

  it("does not join assistant turns", () => {
    expect(chatSpeakerKey({ id: "a1", role: "assistant" })).toBe(
      "assistant:a1"
    );
    expect(chatSpeakerKey({ id: "a2", role: "assistant" })).toBe(
      "assistant:a2"
    );
  });
});

describe("chatBubbleCluster", () => {
  it("squares the meeting edges of consecutive same-speaker turns", () => {
    expect(
      chatBubbleCluster(["agent:brain", "agent:brain", "assistant:1"])
    ).toEqual([
      { meetsAbove: false, meetsBelow: true },
      { meetsAbove: true, meetsBelow: false },
      { meetsAbove: false, meetsBelow: false },
    ]);
  });

  it("treats a memory break as a barrier", () => {
    expect(chatBubbleCluster(["user", "user"], new Set([1]))).toEqual([
      { meetsAbove: false, meetsBelow: false },
      { meetsAbove: false, meetsBelow: false },
    ]);
  });
});

describe("chatUserBubbleClassName", () => {
  it("uses square corners where consecutive bubbles meet", () => {
    expect(
      chatUserBubbleClassName({ meetsAbove: false, meetsBelow: true })
    ).toContain("rounded-b-none!");
    expect(
      chatUserBubbleClassName({ meetsAbove: true, meetsBelow: false })
    ).toContain("rounded-t-none!");
    expect(
      chatUserBubbleClassName({ meetsAbove: true, meetsBelow: true })
    ).toContain("rounded-none!");
  });
});

describe("chatMessageStackClassName", () => {
  it("sits consecutive same-speaker turns a pixel apart", () => {
    expect(
      chatMessageStackClassName({ meetsAbove: true, meetsBelow: false }, false)
    ).toContain("mt-1");
  });
});

describe("softenUserInlineCode", () => {
  it("leaves short tokens as chips", () => {
    expect(softenUserInlineCode("status `draft`")).toBe("status `draft`");
  });

  it("unwraps long ids and paths", () => {
    expect(
      softenUserInlineCode("`01a07636-536b-7da1-9d1b-c1d50ad45580` next")
    ).toBe("01a07636-536b-7da1-9d1b-c1d50ad45580 next");
    expect(isLongInlineToken("Engineering / Mastra / Releases")).toBe(true);
  });
});
