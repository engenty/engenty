import { describe, expect, it } from "vitest";
import {
  extractCopilotMessageCopyText,
  formatCopilotThreadCopyText,
  formatCopilotThreadMarkdown,
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

describe("formatCopilotThreadMarkdown", () => {
  it("writes one section per spoken turn and skips the rest", () => {
    expect(
      formatCopilotThreadMarkdown([
        { parts: [{ text: "Hallo", type: "text" }], role: "user" },
        {
          parts: [{ toolName: "x", type: "tool-invocation" }],
          role: "assistant",
        },
        { parts: [{ text: "Servus!", type: "text" }], role: "assistant" },
        { parts: [{ text: "ignored", type: "text" }], role: "system" },
      ])
    ).toBe("## User\n\nHallo\n\n## Assistant\n\nServus!");
  });
});
