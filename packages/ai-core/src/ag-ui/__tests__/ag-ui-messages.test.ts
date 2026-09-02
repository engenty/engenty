import { MessageSchema } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  buildAgUiMessagesFromThreadMessages,
  normalizeAgUiMessageForPersistence,
  readAgUiMessageCreatedAt,
} from "../ag-ui-messages.js";

function readUserCreatedAt(
  message: ReturnType<typeof buildAgUiMessagesFromThreadMessages>[number]
) {
  return readAgUiMessageCreatedAt(message);
}

describe("AG-UI session message mapping", () => {
  it("maps persisted transcript rows to official AG-UI messages", () => {
    const messages = buildAgUiMessagesFromThreadMessages([
      {
        id: "system-1",
        created_at: "2026-05-21T12:00:00.000Z",
        parts: [{ type: "text", text: "You are helpful." }],
        role: "system",
      },
      {
        id: "user-1",
        created_at: "2026-05-21T12:00:01.000Z",
        parts: [
          { type: "text", text: "Look at this" },
          {
            type: "image",
            source: { type: "url", value: "https://example.test/a.png" },
          },
        ],
        role: "user",
      },
      {
        id: "assistant-1",
        created_at: "2026-05-21T12:00:02.000Z",
        parts: [
          { type: "text", text: "I can help." },
          {
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "navigate",
            input: { to: "/mdl/contacts" },
          },
        ],
        role: "assistant",
      },
      {
        id: "tool-message-1",
        created_at: "2026-05-21T12:00:03.000Z",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "navigate",
            output: { ok: true },
          },
        ],
        role: "tool",
      },
    ]);

    expect(messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    expect(messages.map((message) => MessageSchema.parse(message))).toEqual([
      { id: "system-1", role: "system", content: "You are helpful." },
      {
        id: "user-1",
        role: "user",
        content: [
          { type: "text", text: "Look at this" },
          {
            type: "image",
            source: { type: "url", value: "https://example.test/a.png" },
          },
        ],
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "I can help.",
        toolCalls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "navigate",
              arguments: '{"to":"/mdl/contacts"}',
            },
          },
        ],
      },
      {
        id: "tool-message-1",
        role: "tool",
        toolCallId: "tool-1",
        content: '{"ok":true}',
      },
    ]);
    expect(messages[0]?.metadata).toMatchObject({
      created_at: "2026-05-21T12:00:00.000Z",
      transcript_index: 0,
    });
    expect(messages[1]?.metadata).toMatchObject({
      created_at: "2026-05-21T12:00:01.000Z",
      transcript_index: 1,
    });
    expect(messages[2]?.metadata).toMatchObject({
      created_at: "2026-05-21T12:00:02.000Z",
      transcript_index: 2,
      transcript_parts: [
        { type: "text", text: "I can help." },
        {
          type: "dynamic-tool",
          toolCallId: "tool-1",
          toolName: "navigate",
          input: { to: "/mdl/contacts" },
        },
      ],
    });
    expect(messages[3]?.metadata).toMatchObject({
      created_at: "2026-05-21T12:00:03.000Z",
      transcript_index: 3,
    });
  });

  it("keeps transcript part order metadata on assistant rows", () => {
    const messages = buildAgUiMessagesFromThreadMessages([
      {
        id: "assistant-3",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "tool-3",
            toolName: "engenty_tools_search",
            input: { query: "grants" },
            output: { ok: true },
            state: "output-available",
          },
          { type: "text", text: "Found grants." },
        ],
        role: "assistant",
      },
    ]);

    expect(messages[0]).toMatchObject({
      id: "assistant-3",
      role: "assistant",
      content: "Found grants.",
      metadata: {
        transcript_index: 0,
        transcript_parts: [
          expect.objectContaining({
            type: "dynamic-tool",
            toolCallId: "tool-3",
          }),
          { type: "text", text: "Found grants." },
        ],
      },
    });
  });

  it("aligns assistant toolCalls with synthetic tool rows when text precedes tools", () => {
    const messages = buildAgUiMessagesFromThreadMessages([
      {
        id: "assistant-1",
        parts: [
          { type: "text", text: "Working on it." },
          {
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "engenty_tools_search",
            input: { query: "grants" },
            output: { ok: true },
            state: "output-available",
          },
        ],
        role: "assistant",
      },
    ]);

    expect(messages.map((message) => message.role)).toEqual([
      "assistant",
      "tool",
    ]);
    const [assistantMessage, toolMessage] = messages;
    if (
      assistantMessage?.role !== "assistant" ||
      toolMessage?.role !== "tool"
    ) {
      throw new Error("expected assistant and tool messages");
    }
    expect(assistantMessage.toolCalls?.[0]?.id).toBe("tool-1");
    expect(toolMessage.toolCallId).toBe("tool-1");
  });

  it("emits tool result messages for completed dynamic-tool parts on assistant rows", () => {
    const messages = buildAgUiMessagesFromThreadMessages([
      {
        id: "assistant-2",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "tool-2",
            toolName: "engenty_tools_search",
            input: { moduleId: "knowledge-base" },
            output: { ok: true, matches: [] },
            state: "output-available",
          },
        ],
        role: "assistant",
      },
    ]);

    expect(messages).toEqual([
      {
        id: "assistant-2",
        role: "assistant",
        toolCalls: [
          {
            id: "tool-2",
            type: "function",
            function: {
              name: "engenty_tools_search",
              arguments: '{"moduleId":"knowledge-base"}',
            },
          },
        ],
        metadata: {
          transcript_index: 0,
          transcript_parts: [
            {
              type: "dynamic-tool",
              toolCallId: "tool-2",
              toolName: "engenty_tools_search",
              input: { moduleId: "knowledge-base" },
              output: { ok: true, matches: [] },
              state: "output-available",
            },
          ],
        },
      },
      {
        id: "assistant-2-tool-tool-2",
        role: "tool",
        toolCallId: "tool-2",
        content: '{"ok":true,"matches":[]}',
        metadata: { transcript_index: 1 },
      },
    ]);
  });

  it("normalizes AG-UI input messages for persistence", () => {
    expect(
      normalizeAgUiMessageForPersistence({
        id: "client-user-1",
        role: "user",
        content: [{ type: "text", text: "Find Ada" }],
      })
    ).toEqual({
      client_message_id: "client-user-1",
      parts: [{ type: "text", text: "Find Ada" }],
      role: "user",
      text: "Find Ada",
    });
    expect(
      normalizeAgUiMessageForPersistence({
        id: "tool-result-1",
        role: "tool",
        toolCallId: "tool-1",
        content: '{"ok":true}',
      })
    ).toMatchObject({
      client_message_id: "tool-result-1",
      role: "tool",
      text: '{"ok":true}',
      toolCallId: "tool-1",
    });
  });

  it("sorts persisted rows by created_at before expanding assistant tool rows", () => {
    const messages = buildAgUiMessagesFromThreadMessages([
      {
        id: "z-assistant",
        created_at: "2026-05-21T12:00:01.000Z",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "theme-tool",
            toolName: "invoke_frontend_tool",
            input: { name: "shell_set_theme" },
            output: { ok: true },
            state: "output-available",
          },
        ],
        role: "assistant",
      },
      {
        id: "a-user",
        created_at: "2026-05-21T12:00:00.000Z",
        parts: [{ type: "text", text: "Lass mich aus 10 farben wählen" }],
        role: "user",
      },
    ]);

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    expect(readUserCreatedAt(messages[0])).toBe("2026-05-21T12:00:00.000Z");
  });

  it("reads nested toolCallId from tool-invocation assistant rows", () => {
    const messages = buildAgUiMessagesFromThreadMessages([
      {
        id: "assistant-1",
        created_at: "2026-05-21T12:00:02.000Z",
        parts: [
          {
            type: "tool-invocation",
            toolInvocation: {
              args: { task: "Summarize contacts" },
              result: { summary: "Done." },
              state: "result",
              toolCallId: "call_function_cvuuausam6wj_1",
              toolName: "agent-engenty_tools",
            },
          },
        ],
        role: "assistant",
      },
    ]);

    const assistant = messages.find((message) => message.role === "assistant");
    expect(
      (assistant as { toolCalls?: { id: string }[] })?.toolCalls?.[0]?.id
    ).toBe("call_function_cvuuausam6wj_1");
    expect(messages.at(-1)?.role).toBe("tool");
    expect((messages.at(-1) as { toolCallId?: string })?.toolCallId).toBe(
      "call_function_cvuuausam6wj_1"
    );
  });

  it("omits a persisted tool-approval resume nudge from the transcript", () => {
    const messages = buildAgUiMessagesFromThreadMessages([
      {
        id: "user-q",
        created_at: "2026-05-21T12:00:01.000Z",
        parts: [{ type: "text", text: "Check the inbox thread" }],
        role: "user",
      },
      {
        id: "nudge",
        created_at: "2026-05-21T12:00:03.000Z",
        parts: [
          {
            type: "text",
            text: 'Approved: you may now run "inbox_thread_get". Proceed with the operation.',
          },
        ],
        role: "user",
      },
    ]);

    expect(messages.map((message) => message.id)).toEqual(["user-q"]);
  });
});
