import { describe, expect, it } from "vitest";
import { getToolName, getToolState } from "./copilot-message-parts";

describe("copilot message parts", () => {
  it("prefers explicit tool names over legacy typed part names", () => {
    expect(
      getToolName({
        toolName: "engenty_tool_execute",
        type: "tool-invocation",
      })
    ).toBe("engenty_tool_execute");
  });

  it("does not expose unnamed legacy invocation placeholders as tools", () => {
    expect(getToolName({ type: "tool-invocation" })).toBe("");
  });

  it("treats tool parts with output as completed even when state lags", () => {
    expect(
      getToolState({
        type: "dynamic-tool",
        toolName: "agent-engenty_cli",
        state: "input-available",
        output: { summary: "Done" },
      })
    ).toBe("completed");
  });
});
