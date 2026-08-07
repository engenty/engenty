import { MessageList } from "@mastra/core/agent";
import { describe, expect, it, vi } from "vitest";
import {
  createEngentySessionMemoryStorage,
  isEngentySessionThreadId,
  rowToMastraMessage,
  sessionToThread,
} from "../ai/memory/index.js";
import type {
  ThreadMessageRow,
  ThreadRow,
  ThreadStore,
} from "../dal/threads/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const messageId = "00000000-0000-4000-8000-000000000004";
const internalWorkflowThreadId = `${threadId}-00000000-0000-4000-8000-000000000005`;

function makeSession(overrides: Partial<ThreadRow> = {}): ThreadRow {
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
  overrides: Partial<ThreadMessageRow> = {}
): ThreadMessageRow {
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

function makeStore(overrides: Partial<ThreadStore> = {}): ThreadStore {
  const thread = makeSession();
  const message = makeMessage();
  return {
    appendMessage: vi.fn(async () => ({ message })),
    createThread: vi.fn(async () => ({ thread })),
    deleteThreadForUser: vi.fn(async () => ({ deleted: true })),
    deleteThreadsForUser: vi.fn(async () => ({ deleted: 1 })),
    getThread: vi.fn(async () => thread),
    getThreadGlobally: vi.fn(async () => thread),
    listMessagesOrdered: vi.fn(async () => [message]),
    listThreadsForUser: vi.fn(async () => [thread]),
    updateMessageParts: vi.fn(async (input) => ({
      message: makeMessage({
        author_user_id: null,
        id: input.messageId,
        parts: input.parts,
        role: "assistant",
      }),
    })),
    mergeThreadMetadataForUser: vi.fn(async () => ({ thread })),
    updateThreadForUser: vi.fn(async () => ({ thread })),
    upsertThread: vi.fn(async () => ({ thread })),
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

    expect(store.getThread).toHaveBeenCalledWith({
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

    expect(store.getThread).not.toHaveBeenCalled();
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

    expect(store.upsertThread).toHaveBeenCalledWith(
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

  it("re-injects active_artifact from the current DB row — Mastra's save must not clobber it", async () => {
    // Regression, caught live: a PATCH sets active_artifact (see the thread
    // PATCH route), the passive window applies it via realtime — then the
    // NEXT Mastra saveThread (its own in-memory metadata snapshot predates
    // the PATCH) full-replaces the metadata column and wipes it back to {}.
    const store = makeStore({
      getThread: vi.fn(async () =>
        makeSession({
          metadata: {
            active_artifact: {
              artifact_id: "artifact-1",
              shown_at: "2026-08-06T00:00:00.000Z",
            },
          },
        })
      ),
    });
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
        // Mastra's own snapshot predates the PATCH — no active_artifact here.
        metadata: { agent_id: "engenty.copilot" },
        title: "Ada chat",
      },
    });

    expect(store.upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          active_artifact: {
            artifact_id: "artifact-1",
            shown_at: "2026-08-06T00:00:00.000Z",
          },
        }),
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

    expect(store.upsertThread).not.toHaveBeenCalled();
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
    expect(message?.createdAt).toEqual(new Date("2026-05-17T00:00:01.000Z"));
  });

  // A HITL turn suspends mid-message: the suspend-time flush persists the
  // partial assistant row, and the resume-finish flush RE-SAVES the same id
  // with the trailing text appended. appendMessage's upsert ignores duplicate
  // ids, so a re-save must route through updateMessageParts — before this,
  // the fuller version was silently dropped and a reload lost the final answer.
  it("re-saving an existing assistant message updates its parts", async () => {
    const suspendedParts = [
      { type: "text", text: "" },
      { type: "tool-invocation", toolInvocation: { toolCallId: "call-1" } },
    ];
    const finalParts = [
      { type: "text", text: "" },
      { type: "tool-invocation", toolInvocation: { toolCallId: "call-1" } },
      { type: "step-start" },
      { type: "text", text: "Switched to dark mode." },
    ];
    const existingRow = makeMessage({
      author_user_id: null,
      parts: suspendedParts,
      role: "assistant",
    });
    const store = makeStore({
      listMessagesOrdered: vi.fn(async () => [existingRow]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    await storage.saveMessages({
      messages: [
        {
          id: messageId,
          role: "assistant",
          createdAt: new Date("2026-05-17T00:00:02.000Z"),
          threadId,
          resourceId: userId,
          content: { format: 2, parts: finalParts } as never,
        },
      ],
    });

    expect(store.appendMessage).not.toHaveBeenCalled();
    expect(store.updateMessageParts).toHaveBeenCalledWith({
      tenantId,
      threadId,
      messageId,
      parts: finalParts,
    });
  });

  it("re-saving an existing assistant message with identical parts writes nothing", async () => {
    const parts = [{ type: "text", text: "done" }];
    const store = makeStore({
      listMessagesOrdered: vi.fn(async () => [
        makeMessage({ author_user_id: null, parts, role: "assistant" }),
      ]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    await storage.saveMessages({
      messages: [
        {
          id: messageId,
          role: "assistant",
          createdAt: new Date("2026-05-17T00:00:02.000Z"),
          threadId,
          resourceId: userId,
          content: { format: 2, parts } as never,
        },
      ],
    });

    expect(store.appendMessage).not.toHaveBeenCalled();
    expect(store.updateMessageParts).not.toHaveBeenCalled();
  });

  it("re-saving an existing user message stays insert-once", async () => {
    // The first user insert may carry folded attachment parts; a later
    // text-only re-save must not wipe them.
    const store = makeStore({
      listMessagesOrdered: vi.fn(async () => [
        makeMessage({ parts: [{ type: "text", text: "Hello" }] }),
      ]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    await storage.saveMessages({
      messages: [
        {
          id: messageId,
          role: "user",
          createdAt: new Date("2026-05-17T00:00:02.000Z"),
          threadId,
          resourceId: userId,
          content: {
            format: 2,
            parts: [{ type: "text", text: "Hello" }],
          } as never,
        },
      ],
    });

    expect(store.appendMessage).not.toHaveBeenCalled();
    expect(store.updateMessageParts).not.toHaveBeenCalled();
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

  it("new user inserts adopt the client-assigned userMessageId", async () => {
    // The run stream echoes the user turn under the client id; the durable row
    // must carry the SAME id or attached windows can neither dedupe nor heal it
    // (seen live: DB row d36b… vs streamed trio ffc06… on the same message).
    const clientMessageId = "00000000-0000-4000-8000-0000000000aa";
    const store = makeStore({ listMessagesOrdered: vi.fn(async () => []) });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
      userMessageId: clientMessageId,
    });

    const mastraGeneratedId = "00000000-0000-4000-8000-0000000000bb";
    await storage.saveMessages({
      messages: [
        {
          id: mastraGeneratedId,
          role: "user",
          createdAt: new Date("2026-05-17T00:00:01.000Z"),
          threadId,
          resourceId: userId,
          content: { format: 2, parts: [{ type: "text", text: "Hello" }] },
        },
      ],
    });

    expect(store.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: clientMessageId, role: "user" })
    );
  });

  it("userMessageId re-saves stay insert-once and history user rows keep their ids", async () => {
    const clientMessageId = "00000000-0000-4000-8000-0000000000aa";
    const historyRow = makeMessage(); // existing user row under `messageId`
    const store = makeStore({
      listMessagesOrdered: vi.fn(async () => [
        historyRow,
        makeMessage({
          id: clientMessageId,
          parts: [{ type: "text", text: "Hello" }],
        }),
      ]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
      userMessageId: clientMessageId,
    });

    await storage.saveMessages({
      messages: [
        {
          // History message re-save: keeps its own id (found as existing).
          id: messageId,
          role: "user",
          createdAt: new Date("2026-05-17T00:00:01.000Z"),
          threadId,
          resourceId: userId,
          content: {
            format: 2,
            parts: [{ type: "text", text: "Find Ada Lovelace" }],
          },
        },
        {
          // Current turn re-save (mapped mastra id): row already exists under
          // the client id → insert-once, no duplicate row.
          id: "00000000-0000-4000-8000-0000000000bb",
          role: "user",
          createdAt: new Date("2026-05-17T00:00:02.000Z"),
          threadId,
          resourceId: userId,
          content: { format: 2, parts: [{ type: "text", text: "Hello" }] },
        },
      ],
    });

    expect(store.appendMessage).not.toHaveBeenCalled();
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

  // Was: "keeps a non-user signal as a system message". That coercion silently
  // broke state signals — Mastra rebuilds them with a hard `role === "signal"`
  // filter (dbMessagesToStateSignals), so a row stored as `system` is never
  // recognised and the agent cannot see the state at all. The role and the
  // signal metadata must both survive the write.
  it("preserves the signal role and its metadata", async () => {
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
      expect.objectContaining({
        authorUserId: null,
        metadata: { signal: { id: "s2", type: "state" } },
        role: "signal",
      })
    );
  });

  it("round-trips a control-plane user-signal as a USER message (recall feeds the model a user turn)", async () => {
    // The control-plane loop bug was: user-signal saved as `system` → recall fed
    // the model system rows, not a user turn → it never saw history → re-greeted
    // every turn. Guard the full save→list round trip: the persisted turn must
    // come back as role "user" so Mastra MessageList recalls it as the user's turn.
    const rows: ThreadMessageRow[] = [];
    const store = makeStore({
      appendMessage: vi.fn(async (input) => {
        const row: ThreadMessageRow = {
          author_user_id: input.authorUserId ?? null,
          created_at: "2026-05-17T00:00:01.000Z",
          id: input.id ?? messageId,
          parts: input.parts as ThreadMessageRow["parts"],
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
        parts: [{ type: "text" as const, text: "Prepare memory" }],
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
            format: 2 as const,
            parts: [{ type: "text" as const, text: "Hello!" }],
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
    const rows: ThreadMessageRow[] = [
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
      { type: "text" as const, text: "Checking the weather." },
      {
        type: "tool-invocation" as const,
        toolInvocation: {
          args: { city: "London" },
          state: "result" as const,
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
    const persistedRows: ThreadMessageRow[] = [
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
            format: 2 as const,
            parts: [
              ...assistantParts,
              { type: "text" as const, text: " It is 18C in London." },
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
