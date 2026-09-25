import type { MemoryStorage } from "@mastra/core/storage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindTestModelsPerTest } from "../../../__tests__/helpers/test-model-bindings.js";
import type { ThreadStore } from "../../../dal/threads/index.js";
import {
  createEngentySessionMemoryOptions,
  ENGENTY_MEMORY_LAST_MESSAGES,
  ENGENTY_OBSERVATION_MESSAGE_TOKENS,
  ENGENTY_OBSERVER_MAX_OUTPUT_TOKENS,
  ENGENTY_PREVIOUS_OBSERVER_TOKENS,
  ENGENTY_REFLECTOR_MAX_OUTPUT_TOKENS,
  observationalMemoryEnabled,
} from "../concrete-memory.js";
import { EngentySessionMemoryStorage } from "../engenty-session-memory-storage.js";
import { createEngentySessionMemoryRuntime } from "../invocation-options.js";
import {
  parseSharedObservationalMemoryResourceId,
  resolveSharedObservationsScope,
  sharedObservationalMemoryResourceId,
} from "../shared-observational-memory.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const spaceId = "00000000-0000-4000-8000-000000000003";

// MEMORY.md and TASKS.md ride the same list and are independent of the OM
// switch, so counting processors says nothing about the shared observer.
const SHARED_OM_PROCESSOR = "Engenty shared observational memory";

function hasSharedObservationalProcessor(processors: { name?: string }[]) {
  return processors.some((processor) => processor.name === SHARED_OM_PROCESSOR);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

class TestMemoryStorage extends EngentySessionMemoryStorage {
  readonly #runtimeStore: MemoryStorage | null;

  constructor(
    runtimeStore: MemoryStorage | null,
    store?: ThreadStore,
    options?: { agentId?: string; spaceId?: string }
  ) {
    super({
      agentId: options?.agentId ?? "engenty.copilot",
      scope: { tenantId, userId },
      ...(options?.spaceId ? { spaceId: options.spaceId } : {}),
      store: store ?? ({} as ThreadStore),
    });
    this.#runtimeStore = runtimeStore;
  }

  protected override async getRuntimeMemoryStore(): Promise<MemoryStorage | null> {
    return this.#runtimeStore;
  }
}

bindTestModelsPerTest();

describe("observational memory", () => {
  it("derives shared OM ownership from generic agent scope", () => {
    expect(resolveSharedObservationsScope({ agentScope: "personal" })).toBe(
      "personal"
    );
    expect(resolveSharedObservationsScope({ agentScope: "shared" })).toBe(
      "space"
    );
    expect(resolveSharedObservationsScope({})).toBe("disabled");
  });

  it("is enabled unless the kill switch is exactly false", () => {
    expect(observationalMemoryEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(
      observationalMemoryEnabled({
        ENGENTY_AI_OBSERVATIONAL_MEMORY: "false",
      } as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it("configures thread OM and cache-friendly working-memory signals", () => {
    const options = createEngentySessionMemoryOptions({} as NodeJS.ProcessEnv);

    expect(options.lastMessages).toBe(ENGENTY_MEMORY_LAST_MESSAGES);
    expect(options.workingMemory).toMatchObject({
      agentManaged: false,
      enabled: true,
      scope: "resource",
      useStateSignals: true,
    });
    expect(options.observationalMemory).toMatchObject({
      activateAfterIdle: "auto",
      activateOnProviderChange: true,
      enabled: true,
      observation: {
        // false, not true: `bufferOnIdle` means "observe at the end of every
        // turn" regardless of `messageTokens`, which cost ~22% of a turn's
        // input tokens re-reading the same conversation.
        bufferOnIdle: false,
        manageWorkingMemory: true,
        messageTokens: ENGENTY_OBSERVATION_MESSAGE_TOKENS,
        modelSettings: { maxOutputTokens: ENGENTY_OBSERVER_MAX_OUTPUT_TOKENS },
        observeAttachments: false,
        previousObserverTokens: ENGENTY_PREVIOUS_OBSERVER_TOKENS,
      },
      // A truncated observation is a lost write, so both steps carry an
      // explicit output budget rather than the provider default.
      reflection: {
        modelSettings: {
          maxOutputTokens: ENGENTY_REFLECTOR_MAX_OUTPUT_TOKENS,
        },
      },
      scope: "thread",
    });
    expect((options.observationalMemory as { model?: unknown }).model).not.toBe(
      "google/gemini-2.5-flash"
    );
    expect(
      typeof (options.observationalMemory as { model?: unknown }).model
    ).toBe("object");
  });

  it("removes thread OM behind the kill switch", () => {
    const options = createEngentySessionMemoryOptions({
      ENGENTY_AI_OBSERVATIONAL_MEMORY: "false",
    } as NodeJS.ProcessEnv);

    expect(options.observationalMemory).toBe(false);
  });

  it("leaves semantic recall off unless explicitly enabled with vector env", () => {
    expect(
      createEngentySessionMemoryOptions({} as NodeJS.ProcessEnv).semanticRecall
    ).toBeUndefined();
  });

  it("enables thread-scoped semantic recall when opted in", () => {
    vi.stubEnv("ENGENTY_AI_SEMANTIC_RECALL", "true");
    vi.stubEnv("SUPABASE_DB_URL", "postgres://test");
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    const options = createEngentySessionMemoryOptions(process.env);
    expect(options.semanticRecall).toEqual({
      messageRange: { after: 1, before: 1 },
      scope: "thread",
      topK: 4,
    });
  });

  it("attaches the shared processor to personal chat memory", () => {
    vi.stubEnv("ENGENTY_AI_OBSERVATIONAL_MEMORY", "true");
    vi.stubEnv("SUPABASE_DB_URL", "postgres://test");
    const runtime = createEngentySessionMemoryRuntime({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      sharedObservations: "personal",
      store: {} as ThreadStore,
      threadId: "00000000-0000-4000-8000-000000000004",
    });

    expect(hasSharedObservationalProcessor(runtime.memoryProcessors)).toBe(
      true
    );
  });

  it("does not attach shared staff memory without a space", () => {
    vi.stubEnv("ENGENTY_AI_OBSERVATIONAL_MEMORY", "true");
    vi.stubEnv("SUPABASE_DB_URL", "postgres://test");
    const runtime = createEngentySessionMemoryRuntime({
      agentId: "contacts.manager",
      scope: { tenantId, userId },
      sharedObservations: "space",
      store: {} as ThreadStore,
      threadId: "00000000-0000-4000-8000-000000000004",
    });

    expect(hasSharedObservationalProcessor(runtime.memoryProcessors)).toBe(
      false
    );
  });

  it("attaches shared staff memory inside a space", () => {
    vi.stubEnv("ENGENTY_AI_OBSERVATIONAL_MEMORY", "true");
    vi.stubEnv("SUPABASE_DB_URL", "postgres://test");
    const runtime = createEngentySessionMemoryRuntime({
      agentId: "contacts.manager",
      scope: { tenantId, userId },
      sharedObservations: "space",
      spaceId,
      store: {} as ThreadStore,
      threadId: "00000000-0000-4000-8000-000000000004",
    });

    expect(hasSharedObservationalProcessor(runtime.memoryProcessors)).toBe(
      true
    );
  });

  it("does not attach shared memory when OM is disabled", () => {
    vi.stubEnv("ENGENTY_AI_OBSERVATIONAL_MEMORY", "false");
    const runtime = createEngentySessionMemoryRuntime({
      agentId: "engenty.copilot",
      scope: { tenantId, userId },
      sharedObservations: "personal",
      store: {} as ThreadStore,
      threadId: "00000000-0000-4000-8000-000000000004",
    });

    expect(hasSharedObservationalProcessor(runtime.memoryProcessors)).toBe(
      false
    );
  });

  // Resource-scoped observation lists the resource's threads on every turn.
  // The shared-OM resource id is a synthetic composite, and passing it to the
  // participant query (uuid `principal_id`) killed the whole output-processor
  // workflow with "invalid input syntax for type uuid".
  it("lists a personal shared-OM resource by its owner and agent", async () => {
    const listThreadsForUser = vi.fn(async () => []);
    const storage = new TestMemoryStorage(null, {
      listThreadsForUser,
    } as unknown as ThreadStore);

    await storage.listThreads({
      filter: {
        resourceId: sharedObservationalMemoryResourceId({
          agentId: "engenty.copilot",
          sharedObservations: "personal",
          tenantId,
          userId,
        }) as string,
      },
    });

    expect(listThreadsForUser).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "engenty.copilot", tenantId, userId })
    );
  });

  it("lists a space shared-OM resource by its room and agent", async () => {
    const listThreadsForSpaceAgent = vi.fn(async () => []);
    const storage = new TestMemoryStorage(null, {
      listThreadsForSpaceAgent,
    } as unknown as ThreadStore);

    await storage.listThreads({
      filter: {
        resourceId: sharedObservationalMemoryResourceId({
          agentId: "contacts.manager",
          sharedObservations: "space",
          spaceId,
          tenantId,
          userId,
        }) as string,
      },
    });

    expect(listThreadsForSpaceAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "contacts.manager",
        spaceId,
        tenantId,
      })
    );
  });

  // A shared room keys its conversation resource on the Space (or, with no
  // Space, on the thread). Neither is a participant id: both passed the uuid
  // cast and then matched nobody, so the resource looked threadless.
  it("lists a shared room's Space resource by room and agent", async () => {
    const listThreadsForSpaceAgent = vi.fn(async () => []);
    const listThreadsForUser = vi.fn(async () => []);
    const storage = new TestMemoryStorage(
      null,
      {
        listThreadsForSpaceAgent,
        listThreadsForUser,
      } as unknown as ThreadStore,
      { agentId: "contacts.manager", spaceId }
    );

    await storage.listThreads({ filter: { resourceId: spaceId } });

    expect(listThreadsForSpaceAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "contacts.manager",
        spaceId,
        tenantId,
      })
    );
    expect(listThreadsForUser).not.toHaveBeenCalled();
  });

  it("resolves a Space-less shared room's thread resource to that thread", async () => {
    const threadId = "00000000-0000-4000-8000-000000000009";
    const getThread = vi.fn(async () => ({
      agent_id: "contacts.manager",
      archived_at: null,
      created_at: new Date().toISOString(),
      id: threadId,
      metadata: {},
      updated_at: new Date().toISOString(),
    }));
    const listThreadsForUser = vi.fn(async () => []);
    const storage = new TestMemoryStorage(null, {
      getThread,
      listThreadsForUser,
    } as unknown as ThreadStore);

    const result = await storage.listThreads({
      filter: { resourceId: threadId },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual([threadId]);
    expect(listThreadsForUser).not.toHaveBeenCalled();
  });

  it("reads its own resource as a participant without a thread lookup", async () => {
    const getThread = vi.fn(async () => null);
    const listThreadsForUser = vi.fn(async () => []);
    const storage = new TestMemoryStorage(null, {
      getThread,
      listThreadsForUser,
    } as unknown as ThreadStore);

    await storage.listThreads({ filter: { resourceId: userId } });

    expect(getThread).not.toHaveBeenCalled();
    expect(listThreadsForUser).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, userId })
    );
  });

  it("keeps another tenant's shared-OM resource out of this storage", async () => {
    const listThreadsForUser = vi.fn(async () => []);
    const storage = new TestMemoryStorage(null, {
      listThreadsForUser,
    } as unknown as ThreadStore);

    const result = await storage.listThreads({
      filter: {
        resourceId: `tenant:00000000-0000-4000-8000-0000000000ff:agent:engenty.copilot:user:${userId}`,
      },
    });

    expect(result.threads).toEqual([]);
    expect(listThreadsForUser).not.toHaveBeenCalled();
  });

  it("owns no threads for a resource that is not a participant id", async () => {
    const listThreadsForUser = vi.fn(async () => []);
    const storage = new TestMemoryStorage(null, {
      listThreadsForUser,
    } as unknown as ThreadStore);

    const result = await storage.listThreads({
      filter: { resourceId: "engenty.copilot" },
    });

    expect(result.threads).toEqual([]);
    expect(listThreadsForUser).not.toHaveBeenCalled();
  });

  it("reads back the audience a shared-OM resource id names", () => {
    expect(
      parseSharedObservationalMemoryResourceId(
        `tenant:${tenantId}:agent:engenty.copilot:user:${userId}`
      )
    ).toEqual({
      agentId: "engenty.copilot",
      audience: "user",
      audienceId: userId,
      tenantId,
    });
    expect(parseSharedObservationalMemoryResourceId(userId)).toBeNull();
  });

  it("delegates observational records to the runtime memory store", async () => {
    vi.stubEnv("SUPABASE_DB_URL", "postgres://test");
    const record = { id: "om-1" };
    const getObservationalMemory = vi.fn(async () => record);
    const runtimeStore = {
      getObservationalMemory,
      supportsObservationalMemory: true,
    } as unknown as MemoryStorage;
    const storage = new TestMemoryStorage(runtimeStore);

    await expect(
      storage.getObservationalMemory("thread-1", userId)
    ).resolves.toBe(record);
    expect(storage.supportsObservationalMemory).toBe(true);
    expect(getObservationalMemory).toHaveBeenCalledWith("thread-1", userId);
  });

  it("returns no observational record when Postgres storage is absent", async () => {
    const storage = new TestMemoryStorage(null);

    await expect(
      storage.getObservationalMemory("thread-1", userId)
    ).resolves.toBeNull();
  });

  it("serializes observation writes for the same record", async () => {
    vi.stubEnv("SUPABASE_DB_URL", "postgres://test");
    let active = 0;
    let maxActive = 0;
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    const updateActiveObservations = vi.fn(async () => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (calls === 1) {
        await firstBlocked;
      }
      active -= 1;
    });
    const runtimeStore = {
      supportsObservationalMemory: true,
      updateActiveObservations,
    } as unknown as MemoryStorage;
    const storage = new TestMemoryStorage(runtimeStore);
    const input = {
      id: "shared-record",
      lastObservedAt: new Date(),
      observations: "Observed",
      tokenCount: 10,
    };

    const first = storage.updateActiveObservations(input);
    const second = storage.updateActiveObservations(input);
    await vi.waitFor(() => {
      expect(updateActiveObservations).toHaveBeenCalledTimes(1);
    });
    expect(maxActive).toBe(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(updateActiveObservations).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

  it("keys personal copilot memory by agent and user", () => {
    expect(
      sharedObservationalMemoryResourceId({
        agentId: "engenty.copilot",
        sharedObservations: "personal",
        spaceId,
        tenantId,
        userId,
      })
    ).toBe(`tenant:${tenantId}:agent:engenty.copilot:user:${userId}`);
  });

  it("keys staff memory by agent and space", () => {
    expect(
      sharedObservationalMemoryResourceId({
        agentId: "contacts.manager",
        sharedObservations: "space",
        spaceId,
        tenantId,
        userId,
      })
    ).toBe(`tenant:${tenantId}:agent:contacts.manager:space:${spaceId}`);
  });

  it("does not create shared staff memory outside a space", () => {
    expect(
      sharedObservationalMemoryResourceId({
        agentId: "contacts.manager",
        sharedObservations: "space",
        tenantId,
        userId,
      })
    ).toBeNull();
  });
});
