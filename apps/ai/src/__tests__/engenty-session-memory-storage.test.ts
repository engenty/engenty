import { MessageList } from "@mastra/core/agent";
import { describe, expect, it, vi } from "vitest";
import {
  createEngentySessionMemoryStorage,
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
    markAgentOnBehalfOf: vi.fn(async () => {}),
    listCompactions: vi.fn(async () => []),
    getCompaction: vi.fn(async () => null),
    latestCompactionEnd: vi.fn(async () => null),
    insertCompaction: vi.fn(async () => {
      throw new Error("not in this test");
    }),
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
    // Mastra's ownership assert fetches without a resourceId and must get the
    // key the run presents (the Space), not the row's owner.
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

  it("saves a shared-room thread with the run's user as owner, never the Mastra resourceId", async () => {
    // created_by_user_id references core.users; a Space id there violates the FK.
    const spaceId = "00000000-0000-4000-8000-000000000099";
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.coordinator",
      scope: { tenantId, userId },
      spaceId,
      store,
    });

    await storage.saveThread({
      thread: {
        id: threadId,
        resourceId: spaceId,
        createdAt: new Date("2026-05-17T00:00:00.000Z"),
        updatedAt: new Date("2026-05-17T00:00:00.000Z"),
        metadata: {},
        title: "Room",
      },
    });

    expect(store.upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({ createdByUserId: userId })
    );
  });

  it("re-injects active_artifact from the current DB row — Mastra's save must not clobber it", async () => {
    // Routes outside the Mastra save own this key; Mastra's metadata snapshot
    // is older and must not overwrite it.
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

  it("drops externally owned metadata the DB row no longer has — a stale snapshot must not resurrect it", async () => {
    // The HITL interrupt is cleared by the resume route; writing the run's
    // snapshot back would bring the approval card back on reload.
    const store = makeStore({
      getThread: vi.fn(async () => makeSession({ metadata: {} })),
    });
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
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
          active_artifact: { artifact_id: "artifact-1" },
          agent_id: "engenty.copilot",
        },
        title: "Ada chat",
      },
    });

    const persisted = vi.mocked(store.upsertThread).mock.calls[0]?.[0];
    expect(persisted?.metadata).not.toHaveProperty("active_artifact");
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

  // A resumed turn re-saves the same assistant id with more parts; the fuller
  // version must replace the stored one.
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

  it("re-saving an existing user message keeps its stored attachment parts", async () => {
    const attachment = {
      type: "file",
      metadata: { engenty_attachment: { storage_key: "k" } },
    };
    const store = makeStore({
      listMessagesOrdered: vi.fn(async () => [
        makeMessage({ parts: [{ type: "text", text: "Hello" }, attachment] }),
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

  it("stamps the user turn with where it was said, so the river can be cut into chapters", async () => {
    const store = makeStore();
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store,
      turnContext: {
        module_id: "offers",
        pathname: "/s/engrd/offers/ENG-041",
        route_key: "detail",
        space_id: "00000000-0000-4000-8000-000000000003",
      },
    });

    await storage.saveMessages({
      messages: [
        {
          id: "mastra-message",
          role: "user",
          createdAt: new Date("2026-05-17T00:00:01.000Z"),
          threadId,
          resourceId: userId,
          content: { format: 2, parts: [{ type: "text", text: "Hello" }] },
        },
      ],
    });

    expect(store.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
        metadata: {
          context: {
            module_id: "offers",
            pathname: "/s/engrd/offers/ENG-041",
            route_key: "detail",
            space_id: "00000000-0000-4000-8000-000000000003",
          },
        },
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

  it("new user inserts adopt the client-assigned userMessageId", async () => {
    // The durable row must carry the id the run stream used, or attached
    // windows can neither dedupe nor heal the user turn.
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
    const historyRow = makeMessage();
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

  // Mastra rebuilds state signals by `role === "signal"`; any other stored
  // role hides the state from the agent.
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
    // Recall must feed the model the user's turn, not a system row.
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

    expect(rows).toHaveLength(1);
    const recalled = rowToMastraMessage(rows[0]!);
    expect(recalled?.role).toBe("user");
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

  it("keys an unattended thread on its Space, never on a null author", () => {
    // Unattended work has no human author; Mastra needs a non-null resourceId.
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
    // Assistant and tool turns carry no author; filtering them by resourceId
    // would drop the agent's own answers from recall.
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

describe("tool parts recalled with defined arguments", () => {
  // A tool part without arguments makes the provider reject the whole request,
  // and every later turn resends it; recall is the last gate that can heal it.
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
});
