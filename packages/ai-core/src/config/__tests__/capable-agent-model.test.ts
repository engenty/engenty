import { describe, expect, it } from "vitest";
import { isCapableAgentModel } from "../capable-agent-model.js";

describe("isCapableAgentModel", () => {
  it("requires tool-use, not merely chat availability", () => {
    expect(
      isCapableAgentModel({
        available_for_chat: true,
        tags: ["vision"],
      })
    ).toBe(false);
    expect(
      isCapableAgentModel({
        available_for_chat: true,
        tags: ["tool-use"],
      })
    ).toBe(true);
  });

  it("accepts the tool_use flag from a picker option", () => {
    expect(isCapableAgentModel({ tool_use: true })).toBe(true);
    expect(isCapableAgentModel({ tool_use: false, tags: [] })).toBe(false);
  });

  it("rejects models that are not available for chat", () => {
    expect(
      isCapableAgentModel({
        available_for_chat: false,
        tags: ["tool-use"],
      })
    ).toBe(false);
  });
});
