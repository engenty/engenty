import { describe, expect, it, vi } from "vitest";
import {
  createEngentyAgentExecutionOptions,
  createEngentyMastraResourceId,
  createEngentySessionMemoryRuntime,
} from "../ai/memory/index.js";
import { createOfflineCopilotHarnessRegistry } from "../ai/sessions/__tests__/harness-test-registry.js";
import { createThreadService } from "../ai/sessions.js";
import { createEngentySupervisorDelegationConfig } from "../ai/supervisor/delegation.js";
import type {
  ThreadMessageRow,
  ThreadRow,
  ThreadStore,
} from "../dal/threads/index.js";
import { bindTestModelsPerTest } from "./helpers/test-model-bindings.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const spaceId = "00000000-0000-4000-8000-000000000099";

function makeSession(): ThreadRow {
  return {
    agent_id: "engenty.copilot",
    archived_at: null,
    created_at: "2026-05-17T00:00:00.000Z",
    created_by_user_id: userId,
    id: threadId,
    metadata: {},
    route_context: { thread_id: threadId },
    status: "idle",
    summary: null,
    tenant_id: tenantId,
    title: null,
    updated_at: "2026-05-17T00:00:01.000Z",
    space_id: null,
    visibility: "space",
    workspace_key: null,
  };
}

function makeMessage(
  overrides: Partial<ThreadMessageRow> = {}
): ThreadMessageRow {
  return {
    author_user_id: userId,
    created_at: "2026-05-17T00:00:00.500Z",
    id: "00000000-0000-4000-8000-000000000004",
    parts: [{ type: "text", text: "Hello" }],
    role: "user",
    thread_id: threadId,
    tenant_id: tenantId,
    ...overrides,
  };
}

function makeStore(overrides: Partial<ThreadStore> = {}): ThreadStore {
  const thread = makeSession();
  return {
    appendMessage: vi.fn(async () => ({
      message: makeMessage({
        author_user_id: null,
        id: "00000000-0000-4000-8000-000000000005",
        role: "assistant",
      }),
    })),
    createThread: vi.fn(async () => ({ thread })),
    deleteThreadForUser: vi.fn(async () => ({ deleted: true })),
    deleteThreadsForUser: vi.fn(async () => ({ deleted: 1 })),
    getThread: vi.fn(async () => thread),
    getThreadGlobally: vi.fn(async () => thread),
    getThreadObservationalMemory: vi.fn(async () => null),
    listMessagesByIds: vi.fn(async ({ messageIds }) =>
      [makeMessage()].filter((message) => messageIds.includes(message.id))
    ),
    listMessagesOrdered: vi.fn(async () => [makeMessage()]),
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

bindTestModelsPerTest();

describe("Engenty Mastra memory invocation options", () => {
  it("keys Mastra memory on the user, or on the Space (then thread) for shared rooms", () => {
    const scope = { tenantId, userId };

    expect(createEngentyMastraResourceId({ scope })).toBe(userId);
    expect(
      createEngentyMastraResourceId({ scope, sharedRoom: true, threadId })
    ).toBe(threadId);
    expect(
      createEngentyMastraResourceId({
        scope,
        sharedRoom: true,
        spaceId,
        threadId,
      })
    ).toBe(spaceId);
  });

  it("gives MEMORY.md tools only to agents with a shared-observation audience", () => {
    const shared = createEngentySessionMemoryRuntime({
      agentId: "chief-of-staff",
      scope: { tenantId, userId },
      sharedObservations: "space",
      sharedRoom: true,
      spaceId,
      store: makeStore(),
      threadId,
    });
    expect(shared.memoryTools).toHaveProperty("memory_note");

    const none = createEngentySessionMemoryRuntime({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      store: makeStore(),
      threadId,
    });
    expect(none.memoryTools).toEqual({});
  });

  it("always includes Mastra memory options in execution options", () => {
    expect(
      createEngentyAgentExecutionOptions({
        maxSteps: 12,
        scope: { tenantId, userId },
        threadId,
      })
    ).toMatchObject({
      memory: {
        resource: userId,
        thread: threadId,
      },
    });
  });

  it.each([
    { success: true, error: undefined },
    { success: false, error: new Error("failed") },
  ])("does not bail after a sub-agent delegation (success: $success)", async ({
    error,
    success,
  }) => {
    // The supervisor must take another turn to present the result to the user.
    const bail = vi.fn();
    const delegation = createEngentySupervisorDelegationConfig();

    await delegation.onDelegationComplete?.({
      bail,
      duration: 12,
      ...(error ? { error } : {}),
      iteration: 1,
      messages: [],
      parentAgentId: "engenty.copilot",
      parentAgentName: "Hello",
      primitiveId: "contacts-agent",
      primitiveType: "agent",
      prompt: "Find Ada Lovelace.",
      result: { text: success ? "Ada found." : "" },
      runId: "run-1",
      success,
      toolCallId: "tool-call-1",
    });

    expect(bail).not.toHaveBeenCalled();
  });

  it("fails clearly when an agent has no concrete Mastra memory", async () => {
    const generate = vi.fn(async () => ({ text: "ok" }));
    const sessions = createThreadService({
      assembleDynamicAgent: vi.fn(async () => ({
        generate,
        hasOwnMemory: vi.fn(() => false),
      })) as unknown as Parameters<
        typeof createThreadService
      >[0]["assembleDynamicAgent"],
      getStore: () => makeStore(),
      getUsageStore: () => null,
      mastra: {} as never,
      registry: createOfflineCopilotHarnessRegistry(),
    });

    await expect(
      sessions.generate({
        runId: "run-1",
        scope: { tenantId, userId },
        threadId,
      })
    ).rejects.toMatchObject({
      code: "agent_threads.nativeMemoryUnavailable",
    });
    expect(generate).not.toHaveBeenCalled();
  });
});
