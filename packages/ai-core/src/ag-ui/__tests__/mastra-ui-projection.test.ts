import { MessageSchema } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import { buildAgUiMessagesFromMastraUiMessages } from "../mastra-ui-projection.js";

describe("Mastra UI projection", () => {
  it("maps MessageList ui rows to official AG-UI messages", () => {
    const messages = buildAgUiMessagesFromMastraUiMessages([
      {
        id: "user-1",
        role: "user",
        metadata: { createdAt: "2026-05-21T12:00:01.000Z" },
        parts: [{ type: "text", text: "Weather?" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        metadata: { createdAt: "2026-05-21T12:00:02.000Z" },
        parts: [
          { type: "text", text: "Checking." },
          {
            type: "tool-weather_lookup",
            toolCallId: "tool-1",
            input: { city: "London" },
            state: "output-available",
            output: { tempC: 18 },
          },
        ],
      },
    ]);

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    for (const message of messages) {
      expect(() => MessageSchema.parse(message)).not.toThrow();
    }
    expect(messages[1]?.metadata?.transcript_parts).toEqual([
      { type: "text", text: "Checking." },
      {
        type: "tool-weather_lookup",
        toolCallId: "tool-1",
        input: { city: "London" },
        state: "output-available",
        output: { tempC: 18 },
      },
    ]);
  });

  it("reads agent toolName from tool-invocation rows", () => {
    const messages = buildAgUiMessagesFromMastraUiMessages([
      {
        id: "assistant-2",
        role: "assistant",
        parts: [
          {
            type: "tool-invocation",
            toolInvocation: {
              args: { task: "date" },
              state: "result",
              toolCallId: "sub-1",
              toolName: "agent-engenty_cli",
            },
          } as never,
        ],
      },
    ]);

    expect(
      (messages[0] as { toolCalls?: { function: { name: string } }[] })
        ?.toolCalls?.[0]?.function.name
    ).toBe("agent-engenty_cli");
    expect(
      (messages[0] as { toolCalls?: { id: string }[] })?.toolCalls?.[0]?.id
    ).toBe("sub-1");
  });
});
