import { describe, expect, it } from "vitest";
import type { EngentyAgUiMessage } from "./conversation.js";
import { appendSubAgentProgressToAgUiMessages } from "./sub-agent-progress-message.js";

function assistant(
  overrides: Partial<EngentyAgUiMessage> = {}
): EngentyAgUiMessage {
  return {
    content: "Working on it.",
    id: "assistant-1",
    role: "assistant",
    ...overrides,
  } as EngentyAgUiMessage;
}

function partsOf(message: EngentyAgUiMessage): Record<string, unknown>[] {
  const metadata = message.metadata as
    | { transcript_parts?: unknown }
    | undefined;
  return (metadata?.transcript_parts ?? []) as Record<string, unknown>[];
}

describe("appendSubAgentProgressToAgUiMessages", () => {
  it("opens a row for a hand-off whose tool call has not arrived yet", () => {
    const [message] = appendSubAgentProgressToAgUiMessages([assistant()], {
      agentId: "players.tim",
      line: "Running table_write",
      messageId: null,
      toolCallId: "call-1",
      toolName: "message_agent",
    });

    expect(partsOf(message as EngentyAgUiMessage)).toEqual([
      {
        input: { agent_id: "players.tim" },
        progressLines: ["Running table_write"],
        state: "input-available",
        toolCallId: "call-1",
        toolName: "message_agent",
        type: "dynamic-tool",
      },
    ]);
  });

  it("appends to the existing call once it is there, without a second row", () => {
    const opened = appendSubAgentProgressToAgUiMessages([assistant()], {
      agentId: "players.tim",
      line: "Running table_read",
      messageId: null,
      toolCallId: "call-1",
      toolName: "message_agent",
    });
    const [message] = appendSubAgentProgressToAgUiMessages(opened, {
      agentId: "players.tim",
      line: "Running table_write",
      messageId: null,
      toolCallId: "call-1",
      toolName: "message_agent",
    });

    const parts = partsOf(message as EngentyAgUiMessage);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.progressLines).toEqual([
      "Running table_read",
      "Running table_write",
    ]);
  });

  it("drops a line it cannot place — an unnamed origin opens nothing", () => {
    const [message] = appendSubAgentProgressToAgUiMessages([assistant()], {
      line: "Running table_write",
      messageId: null,
      toolCallId: "call-1",
    });

    expect(partsOf(message as EngentyAgUiMessage)).toEqual([]);
  });

  it("still opens the row when the harness names the in-flight message", () => {
    const [message] = appendSubAgentProgressToAgUiMessages([assistant()], {
      agentId: "players.tom",
      line: "Running table_read",
      messageId: "assistant-1",
      toolCallId: "call-2",
      toolName: "message_agent",
    });

    const parts = partsOf(message as EngentyAgUiMessage);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.toolCallId).toBe("call-2");
  });
});
