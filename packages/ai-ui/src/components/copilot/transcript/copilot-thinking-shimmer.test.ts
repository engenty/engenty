import { describe, expect, it } from "vitest";
import { shouldShowCopilotThinkingShimmer } from "./copilot-thinking-shimmer.js";

describe("shouldShowCopilotThinkingShimmer", () => {
  it("hides while the last assistant turn is still streaming reasoning", () => {
    expect(
      shouldShowCopilotThinkingShimmer({
        status: "streaming",
        lastAssistantParts: [{ type: "reasoning", text: "Still thinking…" }],
      })
    ).toBe(false);
  });

  it("shows while streaming when the last assistant turn has no active tools", () => {
    expect(
      shouldShowCopilotThinkingShimmer({
        status: "streaming",
        lastAssistantParts: [{ type: "text", text: "…" }],
      })
    ).toBe(true);
  });

  it("hides when an open decision interrupt is active", () => {
    expect(
      shouldShowCopilotThinkingShimmer({
        awaitingInterrupt: true,
        openInterrupt: {
          artifact_id: "a1",
          interrupt_id: "a1",
          kind: "decision",
          title: "Pick one",
          tool_call_id: "tc-1",
        },
        status: "submitted",
        lastAssistantParts: [{ type: "text", text: "" }],
      })
    ).toBe(false);
  });

  it("hides when an open frontend-tool interrupt is active", () => {
    expect(
      shouldShowCopilotThinkingShimmer({
        awaitingInterrupt: true,
        openInterrupt: {
          artifact_id: "c1",
          interrupt_id: "c1",
          kind: "frontend_tool",
          title: "Apply patch",
          tool_call_id: "c1",
          tool_name: "contacts_apply_draft_patch",
        },
        status: "ready",
        lastAssistantParts: [{ type: "text", text: "" }],
      })
    ).toBe(false);
  });

  it("hides when the last assistant turn still has an unresolved decision tool", () => {
    expect(
      shouldShowCopilotThinkingShimmer({
        status: "streaming",
        lastAssistantParts: [
          {
            output: {
              artifact_id: "a1",
              artifact_type: "decision",
              choices: [{ id: "x", label: "Yes" }],
              title: "Confirm",
            },
            state: "output-available",
            toolCallId: "tc-1",
            type: "dynamic-tool",
          },
        ],
      })
    ).toBe(false);
  });
});
