import { describe, expect, it } from "vitest";
import { chatSpeakerKey } from "./chat-user-bubble.js";

// The speaker key decides where a speaker's name opens a turn: a colleague
// posting into the room, or a second agent in it, must read as its own voice.
describe("chatSpeakerKey", () => {
  it("tells a colleague and each agent in a room apart from the person", () => {
    const person = chatSpeakerKey({
      parts: [{ text: "Can you check?", type: "text" }],
      role: "user",
    });
    const colleague = chatSpeakerKey({
      parts: [
        {
          text: "**Message from Brain** (engenty `brain`)\n\nAlready approved",
          type: "text",
        },
      ],
      role: "user",
    });
    const agentA = chatSpeakerKey({
      authorName: "Ada",
      id: "a1",
      role: "assistant",
    });
    const agentB = chatSpeakerKey({
      authorName: "Brain",
      id: "a2",
      role: "assistant",
    });
    const agentBAgain = chatSpeakerKey({
      authorName: "Brain",
      id: "a3",
      role: "assistant",
    });

    expect(new Set([person, colleague, agentA, agentB]).size).toBe(4);
    expect(agentBAgain).toBe(agentB);
  });
});
