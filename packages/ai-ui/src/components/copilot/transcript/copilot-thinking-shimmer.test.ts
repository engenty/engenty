import { describe, expect, it } from "vitest";
import { shouldShowCopilotThinkingShimmer } from "./copilot-thinking-shimmer.js";

describe("shouldShowCopilotThinkingShimmer", () => {
  it("shows while the live turn only reasons — nothing else draws a status then", () => {
    expect(
      shouldShowCopilotThinkingShimmer({
        lastAssistantIsLastMessage: true,
        status: "streaming",
        lastAssistantParts: [{ type: "reasoning", text: "Still thinking…" }],
      })
    ).toBe(true);
  });

  it("shows while streaming when the last assistant turn has no active tools", () => {
    expect(
      shouldShowCopilotThinkingShimmer({
        status: "streaming",
        lastAssistantParts: [{ type: "text", text: "…" }],
      })
    ).toBe(true);
  });

  it("hides while the live turn's tool timeline carries the status line", () => {
    // The live timeline header already is the status line; a shimmer under
    // it would say the same thing twice.
    const finishedSearch = {
      input: { query: "x" },
      output: { results: [] },
      state: "output-available",
      toolCallId: "ws-1",
      toolName: "web_search",
      type: "dynamic-tool",
    };
    expect(
      shouldShowCopilotThinkingShimmer({
        lastAssistantIsLastMessage: true,
        lastAssistantParts: [finishedSearch],
        status: "streaming",
      })
    ).toBe(false);
    // An older assistant turn ending on a tool says nothing about the turn the
    // person just sent — the shimmer is all the feedback there is then.
    expect(
      shouldShowCopilotThinkingShimmer({
        lastAssistantIsLastMessage: false,
        lastAssistantParts: [finishedSearch],
        status: "streaming",
      })
    ).toBe(true);
    expect(
      shouldShowCopilotThinkingShimmer({
        lastAssistantIsLastMessage: true,
        lastAssistantParts: [finishedSearch],
        status: "submitted",
      })
    ).toBe(true);
  });

  it("hides while the live turn reasons after a step — the timeline is still live", () => {
    const finishedSearch = {
      input: { query: "x" },
      output: { results: [] },
      state: "output-available",
      toolCallId: "ws-1",
      toolName: "web_search",
      type: "dynamic-tool",
    };
    expect(
      shouldShowCopilotThinkingShimmer({
        lastAssistantIsLastMessage: true,
        lastAssistantParts: [
          finishedSearch,
          { type: "reasoning", text: "Next…" },
        ],
        status: "streaming",
      })
    ).toBe(false);
  });

  it("shows for a new turn although an older turn kept a running tool or an open question", () => {
    const staleRunningTool = {
      input: {},
      state: "input-available",
      toolCallId: "t-old",
      toolName: "routines_create",
      type: "dynamic-tool",
    };
    const openDecision = {
      output: {
        artifact_id: "a1",
        artifact_type: "decision",
        choices: [{ id: "x", label: "Yes" }],
        title: "Confirm",
      },
      state: "output-available",
      toolCallId: "tc-old",
      type: "dynamic-tool",
    };
    for (const parts of [[staleRunningTool], [openDecision]]) {
      expect(
        shouldShowCopilotThinkingShimmer({
          lastAssistantIsLastMessage: false,
          lastAssistantParts: parts,
          status: "submitted",
        })
      ).toBe(true);
    }
  });

  it("stays through reasoning and running tools for a person — the turn's one status line", () => {
    const runningTool = {
      input: {},
      state: "input-available",
      toolCallId: "t-1",
      toolName: "routines_create",
      type: "dynamic-tool",
    };
    for (const parts of [
      [{ type: "reasoning", text: "Still thinking…" }],
      [runningTool],
    ]) {
      expect(
        shouldShowCopilotThinkingShimmer({
          lastAssistantIsLastMessage: true,
          lastAssistantParts: parts,
          personDetail: true,
          status: "streaming",
        })
      ).toBe(true);
    }
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

  it("hides when the live turn still has an unresolved decision tool", () => {
    expect(
      shouldShowCopilotThinkingShimmer({
        lastAssistantIsLastMessage: true,
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
