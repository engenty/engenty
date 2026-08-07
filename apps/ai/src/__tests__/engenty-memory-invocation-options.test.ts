import { Agent, type MastraDBMessage } from "@mastra/core/agent";
import { describe, expect, it, vi } from "vitest";
import {
  assertEngentyNativeMastraMemoryConfigured,
  bindEngentyNativeMastraMemory,
  createEngentyAgentExecutionOptions,
  createEngentyMastraResourceId,
  createEngentyMastraThreadId,
  createEngentyMemoryInvocationOptions,
  createEngentyNativeMastraMemoryAgent,
  createEngentySessionMemoryRuntime,
} from "../ai/memory/index.js";
import { createOfflineCopilotHarnessRegistry } from "../ai/sessions/__tests__/harness-test-registry.js";
import { createThreadService } from "../ai/sessions.js";
import {
  createEngentySupervisorDelegationConfig,
  summarizeDelegationMessages,
} from "../ai/supervisor/delegation.js";
import type {
  ThreadMessageRow,
  ThreadRow,
  ThreadStore,
} from "../dal/threads/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";

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

function makeMastraMessage(input: {
  id: string;
  role: "assistant" | "system" | "user";
  text: string;
}): MastraDBMessage {
  return {
    content: {
      format: 2,
      parts: [{ text: input.text, type: "text" }],
    },
    createdAt: new Date("2026-05-17T00:00:00.000Z"),
    id: input.id,
    role: input.role,
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
    listMessagesOrdered: vi.fn(async () => [makeMessage()]),
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

function makeEmptyFullStream() {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

function makeDynamicAssembler(agent: unknown) {
  return vi.fn(async () => agent) as Parameters<
    typeof createThreadService
  >[0]["assembleDynamicAgent"];
}

function createMemoryHarness(
  options: Parameters<typeof createThreadService>[0]
) {
  return createThreadService({
    registry: createOfflineCopilotHarnessRegistry(),
    ...options,
  });
}

describe("Engenty Mastra memory invocation options", () => {
  it("maps Engenty session and scope identity to Mastra thread/resource ids", () => {
    const scope = { tenantId, userId };

    expect(createEngentyMastraThreadId({ threadId })).toBe(threadId);
    expect(createEngentyMastraResourceId({ scope })).toBe(userId);
    expect(createEngentyMemoryInvocationOptions({ scope, threadId })).toEqual({
      memory: {
        resource: userId,
        thread: threadId,
      },
    });
  });

  it("creates the parallel storage runtime beside invocation options", () => {
    const store = makeStore();

    const runtime = createEngentySessionMemoryRuntime({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      threadId,
      store,
    });

    expect(runtime.invocationOptions).toEqual({
      memory: {
        resource: userId,
        thread: threadId,
      },
    });
    expect(runtime.memory).toBeDefined();
    expect(runtime.storage).toBeDefined();
  });

  it("persists Mastra memory writes through the session store adapter", async () => {
    const store = makeStore();
    const runtime = createEngentySessionMemoryRuntime({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      threadId,
      store,
    });
    const message = makeMastraMessage({
      id: "mastra-assistant-1",
      role: "assistant",
      text: "Native memory should write this.",
    });

    await runtime.storage.saveMessages({
      messages: [
        {
          ...message,
          threadId,
        },
      ],
    });

    expect(store.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "assistant",
        tenantId,
        threadId,
      })
    );
  });

  it("creates concrete Mastra Memory backed by Engenty session storage", async () => {
    const store = makeStore();
    const runtime = createEngentySessionMemoryRuntime({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      threadId,
      store,
    });

    const thread = await runtime.memory.getThreadById({
      resourceId: userId,
      threadId,
    });

    expect(thread).toMatchObject({
      id: threadId,
      resourceId: userId,
    });
    expect(store.getThread).toHaveBeenCalledWith({
      tenantId,
      threadId,
    });
  });

  it("binds concrete Engenty memory to a request-scoped Mastra agent", async () => {
    const runtime = createEngentySessionMemoryRuntime({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      threadId,
      store: makeStore(),
    });
    const agent = new Agent({
      id: "engenty.copilot",
      instructions: "Be helpful.",
      model: "openai/gpt-5-mini",
      name: "Engenty Copilot",
      tools: {},
    });

    const bound = await createEngentyNativeMastraMemoryAgent({
      agent,
      memory: runtime.memory,
    });

    expect(bound.hasOwnMemory()).toBe(true);
    await expect(
      assertEngentyNativeMastraMemoryConfigured(bound)
    ).resolves.toBe(runtime.memory);
  });

  it("always includes Mastra memory options in execution options", () => {
    expect(
      createEngentyAgentExecutionOptions({
        maxSteps: 12,
        runId: "run-1",
        scope: { tenantId, userId },
        threadId,
      })
    ).toMatchObject({
      maxSteps: 12,
      memory: {
        resource: userId,
        thread: threadId,
      },
      runId: "run-1",
    });
  });

  it("adds Mastra supervisor delegation hooks to execution options", () => {
    const options = createEngentyAgentExecutionOptions({
      maxSteps: 12,
      scope: { tenantId, userId },
      threadId,
    });

    expect(options.delegation?.messageFilter).toEqual(expect.any(Function));
    // onDelegationComplete is intentionally absent: the supervisor must always
    // continue after delegation to generate a user-facing summary response.
    expect(options.delegation?.onDelegationComplete).toBeUndefined();
  });

  it("summarizes parent chat messages for sub-agent handoffs", async () => {
    const delegation = createEngentySupervisorDelegationConfig();
    const messages = [
      makeMastraMessage({
        id: "system-1",
        role: "system",
        text: "Internal setup",
      }),
      makeMastraMessage({
        id: "user-1",
        role: "user",
        text: "Find Ada Lovelace.",
      }),
      makeMastraMessage({
        id: "assistant-1",
        role: "assistant",
        text: "I will look in contacts.",
      }),
    ];

    expect(summarizeDelegationMessages(messages)).toBe(
      ["user: Find Ada Lovelace.", "assistant: I will look in contacts."].join(
        "\n"
      )
    );
    expect(
      summarizeDelegationMessages([
        {
          ...makeMastraMessage({
            id: "assistant-empty",
            role: "assistant",
            text: "ignored",
          }),
          content: { format: 2, parts: undefined as never },
        },
      ])
    ).toBe("No prior user-visible chat messages were available.");
    await expect(
      Promise.resolve(
        delegation.messageFilter?.({
          iteration: 1,
          messages,
          parentAgentId: "engenty.copilot",
          parentAgentName: "Hello",
          primitiveId: "contacts-agent",
          primitiveType: "agent",
          prompt: "Find Ada Lovelace.",
          resourceId: userId,
          runId: "run-1",
          threadId,
          toolCallId: "tool-call-1",
        })
      )
    ).resolves.toMatchObject([
      {
        content: {
          content: expect.stringContaining(
            "user: Find Ada Lovelace.\nassistant: I will look in contacts."
          ),
          format: 2,
          parts: [
            {
              text: expect.stringContaining(
                "user: Find Ada Lovelace.\nassistant: I will look in contacts."
              ),
              type: "text",
            },
          ],
        },
        resourceId: userId,
        role: "system",
        threadId,
      },
    ]);
  });

  it("does not bail after successful sub-agent delegation completes", async () => {
    // The supervisor must NOT bail after delegation: it needs to generate a
    // follow-up turn to present the sub-agent result to the user. Bailing
    // left the chat stuck because no summary was ever produced.
    const bail = vi.fn();
    const delegation = createEngentySupervisorDelegationConfig();

    // onDelegationComplete is intentionally absent from the config.
    expect(delegation.onDelegationComplete).toBeUndefined();

    await delegation.onDelegationComplete?.({
      bail,
      duration: 12,
      iteration: 1,
      messages: [],
      parentAgentId: "engenty.copilot",
      parentAgentName: "Hello",
      primitiveId: "contacts-agent",
      primitiveType: "agent",
      prompt: "Find Ada Lovelace.",
      result: { text: "Ada found." },
      runId: "run-1",
      success: true,
      toolCallId: "tool-call-1",
    });

    expect(bail).not.toHaveBeenCalled();
  });

  it("does not bail after failed sub-agent delegation", async () => {
    const bail = vi.fn();
    const delegation = createEngentySupervisorDelegationConfig();

    await delegation.onDelegationComplete?.({
      bail,
      duration: 12,
      error: new Error("failed"),
      iteration: 1,
      messages: [],
      parentAgentId: "engenty.copilot",
      parentAgentName: "Hello",
      primitiveId: "contacts-agent",
      primitiveType: "agent",
      prompt: "Find Ada Lovelace.",
      result: { text: "" },
      runId: "run-1",
      success: false,
      toolCallId: "tool-call-1",
    });

    expect(bail).not.toHaveBeenCalled();
  });

  it("fails clearly when an agent has no concrete Mastra memory", async () => {
    const generate = vi.fn(async () => ({ text: "ok" }));
    const sessions = createMemoryHarness({
      assembleDynamicAgent: makeDynamicAssembler({
        generate,
        hasOwnMemory: vi.fn(() => false),
      }),
      getStore: () => makeStore(),
      getUsageStore: () => null,
      mastra: {} as never,
    });

    await expect(
      sessions.generate({
        runId: "run-1",
        scope: { tenantId, userId },
        threadId,
      })
    ).rejects.toMatchObject({
      code: "agent_threads.nativeMemoryUnavailable",
      details: {
        agent_id: "engenty.copilot",
        thread_id: threadId,
      },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("keeps the readiness guard when native memory cannot be bound", async () => {
    await expect(
      bindEngentyNativeMastraMemory({
        agent: { hasOwnMemory: vi.fn(() => false) },
        details: {
          agent_id: "engenty.copilot",
          thread_id: threadId,
        },
        memory: createEngentySessionMemoryRuntime({
          agentId: "engenty.copilot",
          scope: { tenantId, userId },
          threadId,
          store: makeStore(),
        }).memory,
      })
    ).rejects.toMatchObject({
      code: "agent_threads.nativeMemoryUnavailable",
      details: {
        agent_id: "engenty.copilot",
        thread_id: threadId,
      },
    });
  });

  it("returns the configured Mastra memory instance when the native seam is ready", async () => {
    const memory = {} as never;

    await expect(
      assertEngentyNativeMastraMemoryConfigured({
        getMemory: vi.fn(() => memory),
        hasOwnMemory: vi.fn(() => true),
      })
    ).resolves.toBe(memory);
  });
});
