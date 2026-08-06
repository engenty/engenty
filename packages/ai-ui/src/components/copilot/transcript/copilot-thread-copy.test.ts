import { describe, expect, it } from "vitest";
import {
  extractCopilotMessageCopyText,
  formatCopilotThreadCopyText,
} from "./copilot-thread-copy.js";

describe("copilot thread copy", () => {
  it("joins text and reasoning parts", () => {
    expect(
      extractCopilotMessageCopyText([
        { type: "text", text: "Hello" },
        { type: "reasoning", text: " thinking " },
        { type: "dynamic-tool", toolName: "search" },
        { type: "text", text: "World" },
      ])
    ).toBe("Hello\n\nthinking\n\nWorld");
  });

  it("formats a thread for paste", () => {
    expect(
      formatCopilotThreadCopyText([
        { role: "system", parts: [{ type: "text", text: "ignore" }] },
        { role: "user", parts: [{ type: "text", text: "Hi" }] },
        { role: "assistant", parts: [{ type: "text", text: "Hello!" }] },
        { role: "assistant", parts: [{ type: "dynamic-tool", toolName: "x" }] },
      ])
    ).toBe("User:\nHi\n\nAssistant:\nHello!");
  });
});
