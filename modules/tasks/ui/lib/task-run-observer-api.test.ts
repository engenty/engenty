import { describe, expect, it } from "vitest";
import { readRunInitialPrompt } from "./task-run-observer-api.js";

describe("readRunInitialPrompt", () => {
  it("reads string user content from context snapshot", () => {
    expect(
      readRunInitialPrompt({
        messages: [{ role: "user", content: "Work on ENG-1" }],
      })
    ).toBe("Work on ENG-1");
  });

  it("reads text parts from AG-UI user messages", () => {
    expect(
      readRunInitialPrompt({
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Checkout and update task" }],
          },
        ],
      })
    ).toBe("Checkout and update task");
  });

  it("returns null when no user message exists", () => {
    expect(readRunInitialPrompt({ messages: [] })).toBeNull();
    expect(readRunInitialPrompt(null)).toBeNull();
  });
});
