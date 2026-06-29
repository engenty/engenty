import type { Message } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import { resolveSubmittedUserMessage } from "../session-service.js";

describe("resolveSubmittedUserMessage", () => {
  it("accepts exactly one current user message", () => {
    const nextMessage: Message = {
      id: "client-user-1",
      role: "user",
      content: [{ type: "text", text: "Next" }],
    };

    const resolved = resolveSubmittedUserMessage([nextMessage]);

    expect(resolved.normalized).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "Next" }],
    });
    expect(resolved.message).toBe(nextMessage);
  });

  it("rejects client transcript submissions", () => {
    expect(() =>
      resolveSubmittedUserMessage([
        {
          id: "client-user-1",
          role: "user",
          content: [{ type: "text", text: "Earlier" }],
        },
        {
          id: "client-user-2",
          role: "user",
          content: [{ type: "text", text: "Current" }],
        },
      ])
    ).toThrow("Session runs accept exactly one current user message");
  });
});
