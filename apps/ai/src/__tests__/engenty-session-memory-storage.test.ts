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
    space_id: null,
    visibility: "space",
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
    getThreadObservationalMemory: vi.fn(async () => null),
    listMessagesOrdered: vi.fn(async () => [message]),
    listMessagesByIds: vi.fn(async () => [message]),
    listHeadlessThreadsForTask: vi.fn(async () => []),
    listRunThreadsForSpaceAgent: vi.fn(async () => []),
    listLatestMessagesForThreads: vi.fn(async () => new Map()),
    listAppReleaseMarkersForThreads: vi.fn(async () => []),
    listUnattendedThreadsForSpace: vi.fn(async () => []),
    addAgentMember: vi.fn(async () => {}),
    listAgentMembers: vi.fn(async () => []),
    listDmsForUser: vi.fn(async () => []),
    listRoomsForSpace: vi.fn(async () => []),
    listSpaceRoomsDirectory: vi.fn(async () => []),
    listParticipantThreadIds: vi.fn(async () => []),
    setThreadVisibility: vi.fn(async () => thread),
    removeAgentMember: vi.fn(async () => {}),
    addUserParticipant: vi.fn(async () => {}),
    listUserParticipants: vi.fn(async () => []),
    removeUserParticipant: vi.fn(async () => {}),
    listThreadsForSpaceAgent: vi.fn(async () => []),
    listThreadsForUser: vi.fn(async () => [thread]),
    setThreadStatus: vi.fn(async () => {}),
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

  it("accepts a conversation-keyed resourceId for shared rooms", async () => {
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.coordinator",
      scope: { tenantId, userId },
      store,
    });

    const thread = await storage.getThreadById({
      resourceId: threadId,
      threadId,
    });

    expect(thread).toMatchObject({
      id: threadId,
      resourceId: threadId,
    });
  });

  it("accepts a space-keyed resourceId for shared rooms", async () => {
    const spaceId = "00000000-0000-4000-8000-000000000099";
    const store = makeStore({
      getThread: vi.fn(async () => makeSession({ space_id: spaceId })),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.coordinator",
      scope: { tenantId, userId },
      spaceId,
      store,
    });

    const thread = await storage.getThreadById({
      resourceId: spaceId,
      threadId,
    });

    expect(thread).toMatchObject({
      id: threadId,
      resourceId: spaceId,
    });
  });

  it("answers the Space key for the run's own shared-room thread when Mastra fetches without a resourceId", async () => {
    // Mastra's thread-ownership assert fetches WITHOUT a resourceId and
    // compares strings itself. A shared child thread carries BOTH
    // `created_by_user_id` and `space_id`, so the row-only mapping would
    // answer the owner while the run presents the Space — killing every
    // message_agent run against a hired (shared-scope) agent in a Space.
    const spaceId = "00000000-0000-4000-8000-000000000099";
    const store = makeStore({
      getThread: vi.fn(async () => makeSession({ space_id: spaceId })),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "fun.hello-world",
      scope: { tenantId, userId },
      sharedRoom: true,
      spaceId,
      store,
      threadId,
    });

    const thread = await storage.getThreadById({ threadId });

    expect(thread).toMatchObject({ id: threadId, resourceId: spaceId });
  });

  it("keeps the owner key for a personal thread even when it is space-bound", async () => {
    const spaceId = "00000000-0000-4000-8000-000000000099";
    const store = makeStore({
      getThread: vi.fn(async () => makeSession({ space_id: spaceId })),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      sharedRoom: false,
      spaceId,
      store,
      threadId,
    });

    const thread = await storage.getThreadById({ threadId });

    expect(thread).toMatchObject({ id: threadId, resourceId: userId });
  });

  it("falls back to the thread id for a spaceless shared room", async () => {
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "fun.hello-world",
      scope: { tenantId, userId },
      sharedRoom: true,
      store,
      threadId,
    });

    const thread = await storage.getThreadById({ threadId });

    expect(thread).toMatchObject({ id: threadId, resourceId: threadId });
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

  it("re-injects a room's turn budget the same way — the run that spends it must not reset it", async () => {
    const store = makeStore({
      getThread: vi.fn(async () =>
        makeSession({
          metadata: { agent_turns_since_human: 6, room_paused: false },
        })
      ),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "players.tom",
      scope: { tenantId, userId },
      store,
    });

    await storage.saveThread({
      thread: {
        id: threadId,
        resourceId: userId,
        createdAt: new Date("2026-05-17T00:00:00.000Z"),
        updatedAt: new Date("2026-05-17T00:00:00.000Z"),
        // The run's snapshot was taken two turns ago.
        metadata: { agent_id: "players.tom", agent_turns_since_human: 4 },
        title: "Arena",
      },
    });

    expect(store.upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          agent_turns_since_human: 6,
          room_paused: false,
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

  it("persists the authenticated speaker when Mastra resourceId is the thread", async () => {
    const store = makeStore({ listMessagesOrdered: vi.fn(async () => []) });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.coordinator",
      scope: { tenantId, userId },
      store,
    });

    await storage.saveMessages({
      messages: [
        {
          id: "00000000-0000-4000-8000-0000000000cc",
          role: "user",
          createdAt: new Date("2026-05-17T00:00:01.000Z"),
          threadId,
          resourceId: threadId,
          content: {
            format: 2,
            parts: [{ type: "text", text: "Hello from a shared room" }],
          },
        },
      ],
    });

    expect(store.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        authorUserId: userId,
        role: "user",
        threadId,
      })
    );
  });

  it("persists the authenticated speaker when Mastra resourceId is the space", async () => {
    const spaceId = "00000000-0000-4000-8000-0000000000aa";
    const store = makeStore({ listMessagesOrdered: vi.fn(async () => []) });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.coordinator",
      scope: { tenantId, userId },
      spaceId,
      store,
    });

    await storage.saveMessages({
      messages: [
        {
          id: "00000000-0000-4000-8000-0000000000cd",
          role: "user",
          createdAt: new Date("2026-05-17T00:00:01.000Z"),
          threadId,
          resourceId: spaceId,
          content: {
            format: 2,
            parts: [{ type: "text", text: "Hello from a space room" }],
          },
        },
      ],
    });

    expect(store.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        authorUserId: userId,
        role: "user",
        threadId,
      })
    );
  });

  it("recalls every speaker when Mastra lists by conversation resourceId", async () => {
    const otherUserId = "00000000-0000-4000-8000-000000000099";
    const rows: ThreadMessageRow[] = [
      makeMessage({
        author_user_id: otherUserId,
        id: "00000000-0000-4000-8000-0000000000b1",
        parts: [{ type: "text", text: "from a colleague" }],
      }),
      makeMessage({
        author_user_id: null,
        id: "00000000-0000-4000-8000-0000000000b2",
        parts: [{ type: "text", text: "got it" }],
        role: "assistant",
      }),
    ];
    const store = makeStore({
      listMessagesOrdered: vi.fn(async () => [...rows]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.coordinator",
      scope: { tenantId, userId },
      store,
    });

    const listed = await storage.listMessages({
      perPage: false,
      resourceId: threadId,
      threadId,
    });

    expect(listed.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(listed.messages[0]?.resourceId).toBe(otherUserId);
  });

  it("recalls every speaker when Mastra lists by space resourceId", async () => {
    const spaceId = "00000000-0000-4000-8000-0000000000aa";
    const otherUserId = "00000000-0000-4000-8000-0000000000bb";
    const rows: ThreadMessageRow[] = [
      makeMessage({
        author_user_id: otherUserId,
        id: "00000000-0000-4000-8000-0000000000c1",
        parts: [{ type: "text", text: "from a colleague" }],
      }),
      makeMessage({
        author_user_id: null,
        id: "00000000-0000-4000-8000-0000000000c2",
        parts: [{ type: "text", text: "got it" }],
        role: "assistant",
      }),
    ];
    const store = makeStore({
      getThread: vi.fn(async () => makeSession({ space_id: spaceId })),
      listMessagesOrdered: vi.fn(async () => [...rows]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.coordinator",
      scope: { tenantId, userId },
      spaceId,
      store,
    });

    const listed = await storage.listMessages({
      perPage: false,
      resourceId: spaceId,
      threadId,
    });

    expect(listed.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(listed.messages[0]?.resourceId).toBe(otherUserId);
  });

  it("lists messages by id for Mastra state-signal hydration", async () => {
    const signalMessage = makeMessage({
      id: "00000000-0000-4000-8000-0000000000c1",
      parts: [{ type: "text", text: "profile snapshot" }],
      role: "user",
    });
    const listMessagesByIds = vi.fn(async () => [signalMessage]);
    const store = makeStore({ listMessagesByIds });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.coordinator",
      scope: { tenantId, userId },
      store,
    });

    const listed = await storage.listMessagesById({
      messageIds: [signalMessage.id, "not-a-uuid"],
    });

    expect(listMessagesByIds).toHaveBeenCalledWith({
      messageIds: [signalMessage.id],
      tenantId,
    });
    expect(listed.messages).toHaveLength(1);
    expect(listed.messages[0]).toMatchObject({
      id: signalMessage.id,
      threadId,
    });
  });

  it("returns no messages for an empty listMessagesById call", async () => {
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.coordinator",
      scope: { tenantId, userId },
      store,
    });

    await expect(storage.listMessagesById({ messageIds: [] })).resolves.toEqual(
      {
        messages: [],
      }
    );
    expect(store.listMessagesByIds).not.toHaveBeenCalled();
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

  it("keys an unattended thread on its Space, never on a null author", () => {
    // A routine fire has no human author on purpose. Emitting that null
    // verbatim gave Mastra a `resourceId` its own type forbids and nothing can
    // be keyed on; the Space is what `createEngentyMastraResourceId` picks for
    // a shared room, which every unattended thread is.
    const spaceId = "00000000-0000-4000-8000-0000000000aa";
    expect(
      sessionToThread(
        makeSession({ created_by_user_id: null, space_id: spaceId })
      )
    ).toMatchObject({ resourceId: spaceId });
  });

  it("falls back to the thread itself when an unattended thread has no Space", () => {
    expect(
      sessionToThread(makeSession({ created_by_user_id: null, space_id: null }))
    ).toMatchObject({ resourceId: threadId });
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
    expect(store.listMessagesOrdered).toHaveBeenCalledWith(
      expect.objectContaining({ limit: false })
    );
  });

  it("passes the OM observation cursor to unbounded message recall", async () => {
    const listMessagesOrdered = vi.fn(async () => []);
    const store = makeStore({ listMessagesOrdered });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });
    const start = new Date("2026-05-17T01:00:00.000Z");

    await storage.listMessages({
      filter: { dateRange: { start } },
      perPage: false,
      resourceId: userId,
      threadId,
    });

    expect(listMessagesOrdered).toHaveBeenCalledWith({
      after: start,
      limit: false,
      tenantId,
      threadId,
    });
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

describe("tool parts recalled with defined arguments", () => {
  // A persisted tool part with no args replays as a tool_calls entry with no
  // function.arguments; the provider rejects the WHOLE request with
  // "<400> InternalError.Algo.InvalidParameter: If tool_calls are present in
  // the message, function.arguments must be defined." Every later turn resends
  // the same history, so the thread is stuck for good — recall is the last gate
  // that can heal rows already written.
  it("defaults a dynamic-tool part with no input to {}", () => {
    const message = rowToMastraMessage(
      makeMessage({
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "engenty_tools_search",
            toolCallId: "c1",
            state: "output-available",
            output: { ok: true },
          },
        ],
      })
    );

    const part = message?.content.parts[0] as { input?: unknown };
    expect(part).toHaveProperty("input");
    expect(part.input).toEqual({});
  });

  it("defaults a tool-invocation part with no args to {}", () => {
    const message = rowToMastraMessage(
      makeMessage({
        role: "assistant",
        parts: [
          {
            type: "tool-invocation",
            toolInvocation: {
              state: "result",
              toolCallId: "c1",
              toolName: "engenty_tools_search",
              result: { ok: true },
            },
          },
        ],
      })
    );

    const part = message?.content.parts[0] as {
      toolInvocation?: { args?: unknown };
    };
    expect(part.toolInvocation).toHaveProperty("args");
    expect(part.toolInvocation?.args).toEqual({});
  });

  it("leaves real arguments untouched", () => {
    const message = rowToMastraMessage(
      makeMessage({
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "engenty_tools_search",
            toolCallId: "c1",
            state: "output-available",
            input: { query: "time tracking" },
          },
        ],
      })
    );

    const part = message?.content.parts[0] as { input?: unknown };
    expect(part.input).toEqual({ query: "time tracking" });
  });

  it("paginates recalled messages and reports hasMore", async () => {
    const rows = [0, 1, 2, 3, 4].map((index) =>
      makeMessage({
        created_at: `2026-05-17T00:00:0${index}.000Z`,
        id: `00000000-0000-4000-8000-0000000001${index}0`,
      })
    );
    const store = makeStore({
      listMessagesOrdered: vi.fn(async () => [...rows]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });

    const page0 = await storage.listMessages({
      page: 0,
      perPage: 2,
      threadId,
    });
    expect(page0.messages.map((message) => message.id)).toEqual([
      rows[0]?.id,
      rows[1]?.id,
    ]);
    expect(page0.total).toBe(5);
    expect(page0.hasMore).toBe(true);
    expect(page0.perPage).toBe(2);

    const rest = await storage.listMessages({
      perPage: false,
      threadId,
    });
    expect(rest.messages).toHaveLength(5);
    expect(rest.hasMore).toBe(false);
  });

  it("filters recalled messages by inclusive date range", async () => {
    const rows = [
      makeMessage({
        created_at: "2024-12-31T00:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000201",
      }),
      makeMessage({
        created_at: "2025-03-01T00:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000202",
      }),
      makeMessage({
        created_at: "2025-07-01T00:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000203",
      }),
    ];
    const listMessagesOrdered = vi.fn(async () => [...rows]);
    const store = makeStore({ listMessagesOrdered });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });
    const start = new Date("2025-01-01T00:00:00.000Z");
    const end = new Date("2025-06-01T00:00:00.000Z");

    const listed = await storage.listMessages({
      filter: { dateRange: { end, start } },
      perPage: false,
      threadId,
    });

    expect(listed.messages.map((message) => message.id)).toEqual([
      "00000000-0000-4000-8000-000000000202",
    ]);
    expect(listMessagesOrdered).toHaveBeenCalledWith({
      after: start,
      before: end,
      limit: false,
      tenantId,
      threadId,
    });
  });

  it("filters recalled messages by shallow metadata", async () => {
    const rows = [
      makeMessage({
        id: "00000000-0000-4000-8000-000000000301",
        metadata: {
          archivedAt: null,
          category: "billing",
          escalated: true,
          priority: 2,
        },
      }),
      makeMessage({
        id: "00000000-0000-4000-8000-000000000302",
        metadata: { category: "billing", escalated: false, priority: 2 },
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
      filter: {
        metadata: {
          archivedAt: null,
          category: "billing",
          escalated: true,
          priority: 2,
        },
      },
      perPage: false,
      threadId,
    });
    expect(listed.messages.map((message) => message.id)).toEqual([
      "00000000-0000-4000-8000-000000000301",
    ]);
  });

  it("unions include neighbor windows with the current page", async () => {
    const rows = [0, 1, 2, 3, 4].map((index) =>
      makeMessage({
        created_at: `2026-05-17T00:00:0${index}.000Z`,
        id: `00000000-0000-4000-8000-0000000004${index}0`,
      })
    );
    const store = makeStore({
      listMessagesByIds: vi.fn(async ({ messageIds }) =>
        rows.filter((row) => messageIds.includes(row.id))
      ),
      listMessagesOrdered: vi.fn(async () => [...rows]),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
    });
    const targetId = rows[3]?.id ?? "";

    const listed = await storage.listMessages({
      include: [
        {
          id: targetId,
          withNextMessages: 1,
          withPreviousMessages: 1,
        },
      ],
      page: 0,
      perPage: 2,
      threadId,
    });

    expect(listed.messages.map((message) => message.id)).toEqual([
      rows[0]?.id,
      rows[1]?.id,
      rows[2]?.id,
      rows[3]?.id,
      rows[4]?.id,
    ]);
    expect(listed.total).toBe(5);
    expect(listed.hasMore).toBe(true);
  });
});
