import { describe, expect, it } from "vitest";
import { agUiMessagesToCopilotMessages } from "./copilot-adapter.js";

describe("agUiMessagesToCopilotMessages orphan tools", () => {
  it("attaches unmatched tool results to the preceding assistant message", () => {
    const messages = agUiMessagesToCopilotMessages([
      {
        id: "user-1",
        role: "user",
        content: [{ type: "text", text: "lass mich aus drei farben wählen" }],
        metadata: { transcript_index: 0 },
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "Wähle eine der drei Farben aus.",
        metadata: { transcript_index: 1 },
      },
      {
        id: "assistant-1-tool-decision-1",
        role: "tool",
        toolCallId: "decision-1",
        content: JSON.stringify({
          type: "dynamic-tool",
          toolCallId: "decision-1",
          toolName: "requestDecision",
          state: "output-available",
          output: {
            artifact_id: "artifact-1",
            artifact_type: "decision",
            choices: [
              { id: "red", label: "Rot" },
              { id: "blue", label: "Blau" },
              { id: "green", label: "Grün" },
            ],
            title: "Farbauswahl",
          },
        }),
        metadata: { transcript_index: 2 },
      },
    ]);

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(
      (messages[1]?.parts ?? []).some(
        (part) => (part as { type?: string }).type === "dynamic-tool"
      )
    ).toBe(true);
  });

  it("keeps requestDecision trailing after assistant content is merged from the content field", () => {
    const messages = agUiMessagesToCopilotMessages([
      {
        id: "user-1",
        role: "user",
        content: [{ type: "text", text: "lass mich aus drei farben wählen" }],
        metadata: { transcript_index: 0 },
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "Wähle eine der drei Farben aus.",
        metadata: {
          transcript_index: 1,
          transcript_parts: [
            {
              type: "dynamic-tool",
              toolCallId: "decision-1",
              toolName: "requestDecision",
              state: "output-available",
              output: {
                artifact_id: "artifact-1",
                artifact_type: "decision",
                choices: [
                  { id: "red", label: "Rot" },
                  { id: "blue", label: "Blau" },
                  { id: "green", label: "Grün" },
                ],
                title: "Farbauswahl",
              },
            },
          ],
        },
      },
    ]);

    const assistant = messages[1];
    expect(assistant).toBeDefined();
    expect(
      assistant!.parts?.map((part) => (part as { type?: string }).type)
    ).toEqual(["text", "dynamic-tool"]);
    expect(assistant!.parts?.[1]).toEqual(
      expect.objectContaining({
        toolName: "requestDecision",
        state: "output-available",
      })
    );
  });

  it("hydrates progressLines from transcript_parts onto copilot tool parts", () => {
    const messages = agUiMessagesToCopilotMessages([
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        metadata: {
          transcript_parts: [
            {
              type: "dynamic-tool",
              toolCallId: "sub-1",
              toolName: "agent-engenty_cli",
              state: "input-available",
              input: { task: "pwd" },
              progressLines: ["$ pwd", "/workspace"],
            },
          ],
        },
      },
    ]);

    const part = messages[0]?.parts?.[0] as Record<string, unknown>;
    expect(part.progressLines).toEqual(["$ pwd", "/workspace"]);
  });

  it("reads agent toolName from tool-invocation rows instead of type inference", () => {
    const messages = agUiMessagesToCopilotMessages([
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        metadata: {
          transcript_parts: [
            {
              type: "tool-invocation",
              toolInvocation: {
                args: { task: "date" },
                state: "result",
                toolCallId: "sub-1",
                toolName: "agent-engenty_cli",
              },
            },
          ],
        },
      },
    ]);

    const part = messages[0]?.parts?.[0] as Record<string, unknown>;
    expect(part.toolCallId).toBe("sub-1");
    expect(part.toolName).toBe("agent-engenty_cli");
    expect(part.displayLabel).toBe("CLI Agent");
  });

  it("marks tool-invocation rows complete when nested result is present", () => {
    const messages = agUiMessagesToCopilotMessages([
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        metadata: {
          transcript_parts: [
            {
              type: "tool-invocation",
              toolInvocation: {
                args: { task: "date" },
                result: { summary: "Done" },
                state: "result",
                toolCallId: "sub-1",
                toolName: "agent-engenty_cli",
              },
            },
          ],
        },
      },
    ]);

    const part = messages[0]?.parts?.[0] as Record<string, unknown>;
    expect(part.state).toBe("output-available");
    expect(part.output).toEqual({ summary: "Done" });
  });

  it("drops a tool-approval resume nudge so it does not render as a user bubble", () => {
    const messages = agUiMessagesToCopilotMessages([
      {
        id: "user-q",
        role: "user",
        content: "Check the inbox thread",
        metadata: { transcript_index: 0 },
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        metadata: { transcript_index: 1 },
      },
      {
        id: "nudge",
        role: "user",
        content:
          'Approved: you may now run "inbox_thread_get". Proceed with the operation.',
        metadata: { transcript_index: 2 },
      },
    ]);

    expect(messages.map((message) => message.id)).toEqual([
      "user-q",
      "assistant-1",
    ]);
  });
});
