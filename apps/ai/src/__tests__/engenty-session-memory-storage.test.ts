import { MessageList } from "@mastra/core/agent";
import { describe, expect, it, vi } from "vitest";
import {
  createEngentySessionMemoryStorage,
  isEngentySessionThreadId,
  rowToMastraMessage,
  sessionToThread,
} from "../ai/memory/index.js";
import type {
  AgentSessionMessageRow,
  AgentSessionRow,
  AgentSessionStore,
} from "../dal/agent-sessions/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const messageId = "00000000-0000-4000-8000-000000000004";
const internalWorkflowThreadId = `${threadId}-00000000-0000-4000-8000-000000000005`;

function makeSession(
  overrides: Partial<AgentSessionRow> = {}
): AgentSessionRow {
  return {
    agent_id: "engenty.copilot",
    archived_at: null,
    created_at: "2026-05-17T00:00:00.000Z",
    created_by_user_id: userId,
    id: threadId,
    metadata: { source: "test" },
    route_context: { thread_id: threadId },
    status: "idle",
    summary: null,
    tenant_id: tenantId,
    title: "Ada chat",
    updated_at: "2026-05-17T00:00:10.000Z",
    workspace_key: "workspace",
    ...overrides,
  };
}

function makeMessage(
  overrides: Partial<AgentSessionMessageRow> = {}
): AgentSessionMessageRow {
  return {
    author_user_id: userId,
    created_at: "2026-05-17T00:00:01.000Z",
    id: messageId,
    parts: [{ type: "text", text: "Find Ada Lovelace" }],
    role: "user",
    thread_id: threadId,
    tenant_id: tenantId,
    ...overrides,
  };
}

function makeStore(
  overrides: Partial<AgentSessionStore> = {}
): AgentSessionStore {
  const session = makeSession();
  const message = makeMessage();
  return {
    appendMessage: vi.fn(async () => ({ message })),
    createSession: vi.fn(async () => ({ session })),
    deleteSessionForUser: vi.fn(async () => ({ deleted: true })),
    deleteSessionsForUser: vi.fn(async () => ({ deleted: 1 })),
    getSession: vi.fn(async () => session),
    listMessagesOrdered: vi.fn(async () => [message]),
    listSessionsForUser: vi.fn(async () => [session]),
    updateMessageParts: vi.fn(async (input) => ({
      message: makeMessage({
        author_user_id: null,
        id: input.messageId,
        parts: input.parts,
        role: "assistant",
      }),
    })),
    updateSessionForUser: vi.fn(async () => ({ session })),
    upsertSession: vi.fn(async () => ({ session })),
    ...overrides,
  };
}

describe("EngentySessionMemoryStorage", () => {
  it("only treats exact UUID thread ids as Engenty session-backed threads", () => {
    expect(isEngentySessionThreadId(threadId)).toBe(true);
    expect(isEngentySessionThreadId(internalWorkflowThreadId)).toBe(false);
    expect(isEngentySessionThreadId(`${threadId}-engenty_tools`)).toBe(false);
  });

  it("maps Mastra thread ids directly to Engenty session ids", async () => {
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    const thread = await storage.getThreadById({ threadId });

    expect(store.getSession).toHaveBeenCalledWith({
      tenantId,
      threadId,
    });
    expect(thread).toMatchObject({
      id: threadId,
      resourceId: userId,
      title: "Ada chat",
      metadata: {
        agent_id: "engenty.copilot",
        route_context: { thread_id: threadId },
        source: "test",
        workspace_key: "workspace",
      },
    });
  });

  it("does not query agent sessions for Mastra internal workflow thread ids", async () => {
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    await expect(
      storage.getThreadById({ threadId: internalWorkflowThreadId })
    ).resolves.toBeNull();

    expect(store.getSession).not.toHaveBeenCalled();
  });

  it("saves Mastra threads through the existing session store", async () => {
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "dynamic-agent",
      scope: { tenantId, userId },
      store,
    });

    await storage.saveThread({
      thread: {
        id: threadId,
        resourceId: userId,
        createdAt: new Date("2026-05-17T00:00:00.000Z"),
        updatedAt: new Date("2026-05-17T00:00:00.000Z"),
        metadata: {
          agent_id: "engenty.copilot",
          route_context: { thread_id: threadId, session_key: "chat" },
          custom: "kept",
        },
        title: "Ada chat",
      },
    });

    expect(store.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: threadId,
        tenantId,
        createdByUserId: userId,
        agentId: "engenty.copilot",
        metadata: { custom: "kept" },
        routeContext: { thread_id: threadId, session_key: "chat" },
        title: "Ada chat",
      })
    );
  });

  it("does not persist Mastra internal workflow threads as agent sessions", async () => {
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "dynamic-agent",
      scope: { tenantId, userId },
      store,
    });
    const thread = {
      id: internalWorkflowThreadId,
      resourceId: userId,
      createdAt: new Date("2026-05-17T00:00:00.000Z"),
      updatedAt: new Date("2026-05-17T00:00:00.000Z"),
      metadata: {},
      title: "Prepare memory workflow",
    };

    await expect(storage.saveThread({ thread })).resolves.toBe(thread);

    expect(store.upsertSession).not.toHaveBeenCalled();
  });

  it("maps persisted messages to Mastra messages with user resource metadata", async () => {
    const message = rowToMastraMessage(makeMessage());

    expect(message).toMatchObject({
      id: messageId,
      role: "user",
      threadId,
      resourceId: userId,
      content: {
        format: 2,
        parts: [{ type: "text", text: "Find Ada Lovelace" }],
        metadata: { author_user_id: userId },
      },
    });
    expect(message.createdAt).toEqual(new Date("2026-05-17T00:00:01.000Z"));
  });

  it("appends Mastra user messages with the current user as author", async () => {
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    await storage.saveMessages({
      messages: [
        {
          id: "mastra-message",
          role: "user",
          createdAt: new Date("2026-05-17T00:00:01.000Z"),
          threadId,
          resourceId: userId,
          content: {
            format: 2,
            parts: [{ type: "text", text: "Hello" }],
          },
        },
      ],
    });

    expect(store.appendMessage).toHaveBeenCalledWith({
      tenantId,
      threadId,
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
      authorUserId: userId,
    });
  });

  it("persists a control-plane user-message SIGNAL as a real user turn", async () => {
    // sendMessage on the control plane wraps the user turn as a `type: 'user'`
    // signal (role "signal"). It must persist as role "user" + author — not the
    // generic signal→system mapping, which hides the user's message in the UI.
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    await storage.saveMessages({
      messages: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          role: "signal",
          createdAt: new Date("2026-05-17T00:00:01.000Z"),
          threadId,
          resourceId: userId,
          content: {
            format: 2,
            parts: [{ type: "text", text: "hey" }],
            metadata: { signal: { id: "s1", type: "user" } },
          },
        } as never,
      ],
    });

    expect(store.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
        parts: [{ type: "text", text: "hey" }],
        authorUserId: userId,
      })
    );
  });

  it("keeps a non-user signal as a system message", async () => {
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    await storage.saveMessages({
      messages: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          role: "signal",
          createdAt: new Date("2026-05-17T00:00:01.000Z"),
          threadId,
          resourceId: userId,
          content: {
            format: 2,
            parts: [{ type: "text", text: "state changed" }],
            metadata: { signal: { id: "s2", type: "state" } },
          },
        } as never,
      ],
    });

    expect(store.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "system", authorUserId: null })
    );
  });

  it("round-trips a control-plane user-signal as a USER message (recall feeds the model a user turn)", async () => {
    // The control-plane loop bug was: user-signal saved as `system` → recall fed
    // the model system rows, not a user turn → it never saw history → re-greeted
    // every turn. Guard the full save→list round trip: the persisted turn must
    // come back as role "user" so Mastra MessageList recalls it as the user's turn.
    const rows: AgentSessionMessageRow[] = [];
    const store = makeStore({
      appendMessage: vi.fn(async (input) => {
        const row: AgentSessionMessageRow = {
          author_user_id: input.authorUserId ?? null,
          created_at: "2026-05-17T00:00:01.000Z",
          id: input.id ?? messageId,
          parts: input.parts as AgentSessionMessageRow["parts"],
          role: input.role,
          tenant_id: tenantId,
          thread_id: input.threadId,
        };
        rows.push(row);
        return { message: row };
      }),
      listMessagesOrdered: vi.fn(async () => [...rows]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    await storage.saveMessages({
      messages: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          role: "signal",
          createdAt: new Date("2026-05-17T00:00:01.000Z"),
          threadId,
          resourceId: userId,
          content: {
            format: 2,
            parts: [{ type: "text", text: "my favorite color is teal" }],
            metadata: { signal: { id: "s3", type: "user" } },
          },
        } as never,
      ],
    });

    // The persisted row reads back as a USER message (what recall feeds the model).
    expect(rows).toHaveLength(1);
    const recalled = rowToMastraMessage(rows[0]!);
    expect(recalled?.role).toBe("user");
    // And Mastra MessageList recalls it as a user turn (not system).
    const list = new MessageList({ threadId, resourceId: userId });
    list.add([recalled!], "memory");
    expect(list.get.all.ui().at(-1)?.role).toBe("user");
  });

  it("passes through messages for Mastra internal workflow threads", async () => {
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });
    const message = {
      id: "mastra-workflow-message",
      role: "user" as const,
      createdAt: new Date("2026-05-17T00:00:01.000Z"),
      threadId: internalWorkflowThreadId,
      resourceId: userId,
      content: {
        format: 2 as const,
        parts: [{ type: "text", text: "Prepare memory" }],
      },
    };

    await expect(
      storage.saveMessages({ messages: [message] })
    ).resolves.toEqual({ messages: [message] });

    expect(store.listMessagesOrdered).not.toHaveBeenCalled();
    expect(store.appendMessage).not.toHaveBeenCalled();
  });

  it("appends each Mastra save without content-match dedup", async () => {
    const existingUserMessage = makeMessage({
      parts: [{ type: "text", text: "hi" }],
    });
    const store = makeStore({
      listMessagesOrdered: vi.fn(async () => [existingUserMessage]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    await storage.saveMessages({
      messages: [
        {
          id: "mastra-user-dup",
          role: "user",
          createdAt: new Date("2026-05-17T00:00:02.000Z"),
          threadId,
          resourceId: userId,
          content: {
            format: 2,
            parts: [{ type: "text", text: "hi" }],
          },
        },
      ],
    });

    expect(store.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("updates assistant rows by message id only", async () => {
    const existingAssistantMessage = makeMessage({
      author_user_id: null,
      id: "00000000-0000-4000-8000-000000000011",
      parts: [{ type: "text", text: "Hel" }],
      role: "assistant",
    });
    const store = makeStore({
      listMessagesOrdered: vi.fn(async () => [existingAssistantMessage]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    const updated = await storage.updateMessages({
      messages: [
        {
          id: existingAssistantMessage.id,
          role: "assistant",
          threadId,
          content: {
            parts: [{ type: "text", text: "Hello!" }],
          },
        },
      ],
    });

    expect(store.appendMessage).not.toHaveBeenCalled();
    expect(store.updateMessageParts).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: existingAssistantMessage.id,
        parts: [{ type: "text", text: "Hello!" }],
        tenantId,
        threadId,
      })
    );
    expect(updated[0]?.id).toBe(existingAssistantMessage.id);
  });

  it("keeps thread conversion outcome stable for docs and future wiring", () => {
    expect(sessionToThread(makeSession())).toMatchObject({
      id: threadId,
      resourceId: userId,
      metadata: {
        agent_id: "engenty.copilot",
        status: "idle",
      },
    });
  });

  it("recalls assistant/tool turns even when a resourceId is passed", async () => {
    // Mastra recall calls `listMessages({ threadId, resourceId, ... })`. Assistant
    // and tool turns have no `author_user_id` (→ `resourceId: undefined`), so a
    // strict `message.resourceId === resourceId` filter dropped them — the model
    // recalled the user's questions with NONE of its own answers and re-answered
    // every prior request each run. The thread is already scoped by threadId +
    // tenant, so only authored (user) turns assert the resource.
    const rows: AgentSessionMessageRow[] = [
      makeMessage({
        id: "00000000-0000-4000-8000-0000000000a1",
        parts: [{ type: "text", text: "who is on my team?" }],
        role: "user",
      }),
      makeMessage({
        author_user_id: null,
        id: "00000000-0000-4000-8000-0000000000a2",
        parts: [{ type: "text", text: "You and Timon." }],
        role: "assistant",
      }),
      makeMessage({
        author_user_id: null,
        id: "00000000-0000-4000-8000-0000000000a3",
        parts: [
          {
            type: "tool-result",
            result: { members: 2 },
            toolCallId: "tc-1",
            toolName: "team_list",
          },
        ],
        role: "tool",
      }),
    ];
    const store = makeStore({
      listMessagesOrdered: vi.fn(async () => [...rows]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    const listed = await storage.listMessages({
      perPage: false,
      resourceId: userId,
      threadId,
    });

    expect(listed.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "assistant",
    ]);
  });

  it("round-trips tool history through MessageList for model and UI prompts", async () => {
    const toolCallId = "tool-call-weather-1";
    const assistantParts = [
      { type: "text", text: "Checking the weather." },
      {
        type: "tool-invocation",
        toolInvocation: {
          args: { city: "London" },
          state: "result",
          step: 0,
          toolCallId,
          toolName: "weather_lookup",
        },
      },
    ];
    const toolParts = [
      {
        type: "tool-result",
        result: { city: "London", tempC: 18 },
        toolCallId,
        toolName: "weather_lookup",
      },
    ];
    const persistedRows: AgentSessionMessageRow[] = [
      makeMessage({
        id: "00000000-0000-4000-8000-000000000010",
        parts: [{ type: "text", text: "Weather in London?" }],
        role: "user",
      }),
      makeMessage({
        author_user_id: null,
        id: "00000000-0000-4000-8000-000000000011",
        parts: assistantParts,
        role: "assistant",
      }),
      makeMessage({
        author_user_id: null,
        id: "00000000-0000-4000-8000-000000000012",
        parts: toolParts,
        role: "tool",
      }),
    ];
    const store = makeStore({
      appendMessage: vi.fn(async (input) => {
        const message = makeMessage({
          author_user_id: input.authorUserId ?? null,
          id: `00000000-0000-4000-8000-${String(persistedRows.length + 20).padStart(12, "0")}`,
          parts: input.parts,
          role: input.role,
        });
        persistedRows.push(message);
        return { message };
      }),
      listMessagesOrdered: vi.fn(async () => [...persistedRows]),
      updateMessageParts: vi.fn(async (input) => {
        const index = persistedRows.findIndex(
          (row) => row.id === input.messageId
        );
        const existing = persistedRows[index];
        if (!existing) {
          throw new Error(`message not found: ${input.messageId}`);
        }
        const message = {
          ...existing,
          parts: input.parts,
        };
        persistedRows[index] = message;
        return { message };
      }),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    await storage.updateMessages({
      messages: [
        {
          id: "00000000-0000-4000-8000-000000000011",
          threadId,
          content: {
            parts: [
              ...assistantParts,
              { type: "text", text: " It is 18C in London." },
            ],
          },
        },
      ],
    });

    const listed = await storage.listMessages({
      perPage: false,
      threadId,
    });
    const messageList = new MessageList({ threadId, resourceId: userId });
    messageList.add(listed.messages, "memory");

    const llmPrompt = await messageList.get.all.aiV5.llmPrompt();
    const uiMessages = messageList.get.all.aiV5.ui();

    expect(listed.messages).toHaveLength(3);
    expect(listed.messages[1]?.content.parts).toEqual([
      ...assistantParts,
      { type: "text", text: " It is 18C in London." },
    ]);
    expect(listed.messages[2]?.content.parts).toEqual(toolParts);
    expect(store.updateMessageParts).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "00000000-0000-4000-8000-000000000011",
        parts: [
          ...assistantParts,
          { type: "text", text: " It is 18C in London." },
        ],
        tenantId,
        threadId,
      })
    );
    expect(llmPrompt.some((message) => message.role === "tool")).toBe(true);
    expect(
      uiMessages.some((message) =>
        message.parts.some(
          (part) =>
            part.type === "tool-invocation" ||
            (typeof part.type === "string" && part.type.startsWith("tool-"))
        )
      )
    ).toBe(true);
  });
});
