import type { AiUsageStore, UsageEventRecord } from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import { createOfflineCopilotHarnessRegistry } from "../ai/sessions/__tests__/harness-test-registry.js";
import {
  createSessionService,
  type SessionServiceOptions,
} from "../ai/sessions.js";
import type {
  AgentSessionMessageRow,
  AgentSessionRow,
  AgentSessionStore,
} from "../dal/agent-sessions/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";

function createAiService(options: SessionServiceOptions) {
  return {
    sessions: createSessionService({
      registry: createOfflineCopilotHarnessRegistry(),
      ...options,
    }),
  };
}

function makeSession(
  overrides: Partial<AgentSessionRow> = {}
): AgentSessionRow {
  return {
    id: threadId,
    tenant_id: tenantId,
    agent_id: "engenty.copilot",
    created_by_user_id: userId,
    title: null,
    summary: null,
    status: "idle",
    route_context: {},
    workspace_key: null,
    metadata: {},
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeMessage(
  overrides: Partial<AgentSessionMessageRow> = {}
): AgentSessionMessageRow {
  return {
    id: "00000000-0000-4000-8000-000000000004",
    tenant_id: tenantId,
    thread_id: threadId,
    role: "user",
    parts: [{ type: "text", text: "Find Ada Lovelace" }],
    author_user_id: userId,
    created_at: "2026-01-01T00:00:01Z",
    ...overrides,
  };
}

function makeSessionStore(
  overrides: Partial<AgentSessionStore> = {}
): AgentSessionStore {
  const session = makeSession();
  return {
    appendMessage: vi.fn(async () => ({
      message: {
        id: "00000000-0000-4000-8000-000000000004",
        tenant_id: tenantId,
        thread_id: threadId,
        role: "assistant",
        parts: [{ type: "text", text: "ok" }],
        author_user_id: null,
        created_at: "2026-01-01T00:00:01Z",
      },
    })),
    createSession: vi.fn(async () => ({ session })),
    deleteSessionForUser: vi.fn(),
    deleteSessionsForUser: vi.fn(),
    getSession: vi.fn(async () => session),
    listMessagesOrdered: vi.fn(async () => [makeMessage()]),
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

function makeUsageStore(overrides: Partial<AiUsageStore> = {}): AiUsageStore {
  const insertEvent = vi.fn(async (input) => ({
    id: "00000000-0000-4000-8000-000000000005",
    created_at: "2026-01-01T00:00:02Z",
    ...input,
  })) as AiUsageStore["insertEvent"];
  return {
    bumpPeriodTotals: vi.fn(async () => undefined),
    getActiveModelPricing: vi.fn(async () => null),
    getPeriodTotals: vi.fn(async () => null),
    getTenantPolicy: vi.fn(async () => null),
    getUserPolicy: vi.fn(async () => null),
    insertEvent,
    insertModelPricing: vi.fn(),
    listModelPricing: vi.fn(async () => []),
    listUsedModelPricing: vi.fn(async () => []),
    listUserPolicies: vi.fn(async () => []),
    summarizeUsageByModel: vi.fn(async () => []),
    summarizeUsageByUser: vi.fn(async () => []),
    summarizeUsageByThread: vi.fn(async () => null),
    upsertTenantPolicy: vi.fn(),
    upsertUserPolicy: vi.fn(),
    ...overrides,
  };
}

function makeDynamicAssembler(
  output: unknown,
  options: { nativeMemory?: boolean } = { nativeMemory: true }
) {
  return vi.fn(async () => ({
    generate: vi.fn(async () => output),
    ...(options.nativeMemory
      ? {
          getMemory: vi.fn(async () => ({})),
          hasOwnMemory: vi.fn(() => true),
        }
      : {}),
    streamUntilIdle: vi.fn(async () => output),
  })) as SessionServiceOptions["assembleDynamicAgent"];
}

describe("AI session usage metering", () => {
  it("runs on a granted model when the platform default is denied", async () => {
    // The tenant granted `openai/other-model`. Resolution must land on it
    // rather than on the platform default: returning the default unchecked made
    // the preflight reject every turn, bricking the tenant with no way out.
    const usageStore = makeUsageStore({
      getTenantPolicy: vi.fn(async () => ({
        tenant_id: tenantId,
        tier: "test",
        period_mode: "calendar",
        period_unit: "month",
        period_anchor: null,
        included_input_tokens: null,
        included_output_tokens: null,
        included_cost_micros: null,
        hard_limit_cost_micros: null,
        soft_limit_cost_micros: null,
        allowed_models: ["openai/other-model"],
        allowed_providers: null,
        enforcement_mode: "enforce",
        currency: "usd",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      })),
    });
    const harness = createAiService({
      assembleDynamicAgent: makeDynamicAssembler({ text: "ok" }),
      getStore: () => makeSessionStore(),
      getUsageStore: () => usageStore,
      mastra: {} as never,
    });

    await expect(
      harness.sessions.generate({
        scope: { tenantId, userId },
        threadId,
      })
    ).resolves.toBeDefined();
  });

  it("blocks generation when no granted model can be substituted", async () => {
    // A provider-only grant that excludes the default leaves the resolver with
    // no id to name — the preflight is the last line of defence and must still
    // reject rather than run an unlicensed model.
    const usageStore = makeUsageStore({
      getTenantPolicy: vi.fn(async () => ({
        tenant_id: tenantId,
        tier: "test",
        period_mode: "calendar",
        period_unit: "month",
        period_anchor: null,
        included_input_tokens: null,
        included_output_tokens: null,
        included_cost_micros: null,
        hard_limit_cost_micros: null,
        soft_limit_cost_micros: null,
        allowed_models: null,
        allowed_providers: ["some-other-vendor"],
        enforcement_mode: "enforce",
        currency: "usd",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      })),
    });
    const harness = createAiService({
      assembleDynamicAgent: makeDynamicAssembler({ text: "blocked" }),
      getStore: () => makeSessionStore(),
      getUsageStore: () => usageStore,
      mastra: {} as never,
    });

    await expect(
      harness.sessions.generate({
        scope: { tenantId, userId },
        threadId,
      })
    ).rejects.toMatchObject({
      code: "agent_threads.usageLimitExceeded",
    });
    expect(usageStore.insertEvent).not.toHaveBeenCalled();
  });

  it("records usage after successful generation", async () => {
    const usageStore = makeUsageStore();
    const harness = createAiService({
      assembleDynamicAgent: makeDynamicAssembler({
        text: "ok",
        totalUsage: {
          inputTokens: 10,
          outputTokens: 5,
          inputTokenDetails: {
            cacheReadTokens: 2,
          },
          outputTokenDetails: {
            reasoningTokens: 1,
          },
        },
      }),
      getStore: () => makeSessionStore(),
      getUsageStore: () => usageStore,
      mastra: {} as never,
    });

    await harness.sessions.generate({
      scope: { tenantId, userId },
      threadId,
      runId: "00000000-0000-4000-8000-000000000006",
    });

    expect(usageStore.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: tenantId,
        user_id: userId,
        thread_id: threadId,
        run_id: "00000000-0000-4000-8000-000000000006",
        agent_id: "engenty.copilot",
        feature: "copilot",
        input_tokens: 10,
        output_tokens: 5,
        cached_tokens: 2,
        reasoning_tokens: 1,
      } satisfies Partial<UsageEventRecord>)
    );
    expect(usageStore.bumpPeriodTotals).toHaveBeenCalledTimes(2);
  });

  it("uses tenant model settings for supervisor usage checks and metering", async () => {
    const usageStore = makeUsageStore({
      getTenantPolicy: vi.fn(async () => ({
        tenant_id: tenantId,
        tier: "test",
        period_mode: "calendar",
        period_unit: "month",
        period_anchor: null,
        included_input_tokens: null,
        included_output_tokens: null,
        included_cost_micros: null,
        hard_limit_cost_micros: null,
        soft_limit_cost_micros: null,
        // Both tenant-pinned models must be on the allow-list — with enforce
        // mode, a pin outside the list is demoted to the platform/default.
        allowed_models: ["openai/tenant-chat", "openai/tenant-routing"],
        enforcement_mode: "enforce",
        currency: "usd",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      })),
    });
    const assembleDynamicAgent = makeDynamicAssembler({
      text: "ok",
      totalUsage: {
        inputTokens: 2,
        outputTokens: 1,
      },
    });
    const resolveTenantModelConfig = vi.fn(async () => ({
      chatModelId: "openai/tenant-chat",
      routingModelId: "openai/tenant-routing",
    }));
    const harness = createAiService({
      assembleDynamicAgent,
      getStore: () => makeSessionStore(),
      getUsageStore: () => usageStore,
      mastra: {} as never,
      registry: createOfflineCopilotHarnessRegistry({
        subAgents: [{ alias: "engenty_cli", id: "engenty.cli" }],
      }),
      resolveTenantModelConfig,
    });

    await harness.sessions.generate({
      scope: { tenantId, userId },
      threadId,
    });

    expect(resolveTenantModelConfig).toHaveBeenCalledWith({ tenantId, userId });
    expect(assembleDynamicAgent).toHaveBeenCalledWith(
      expect.anything(),
      "engenty.copilot",
      expect.objectContaining({
        modelConfig: expect.objectContaining({
          chatModelId: "openai/tenant-chat",
          routingModelId: "openai/tenant-routing",
        }),
      })
    );
    expect(usageStore.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        model_id: "openai/tenant-routing",
      } satisfies Partial<UsageEventRecord>)
    );
  });

  it("passes request model overrides through runtime model resolution", async () => {
    const assembleDynamicAgent = makeDynamicAssembler({
      text: "ok",
      totalUsage: { inputTokens: 2, outputTokens: 1 },
    });
    const harness = createAiService({
      assembleDynamicAgent,
      getStore: () => makeSessionStore(),
      getUsageStore: () => makeUsageStore(),
      mastra: {} as never,
      resolveTenantModelConfig: vi.fn(async () => ({
        chatModelId: "openai/tenant-chat",
        routingModelId: "openai/tenant-routing",
      })),
    });

    await harness.sessions.generate({
      modelIdOverride: "openai/requested",
      scope: { tenantId, userId },
      threadId,
    });

    expect(assembleDynamicAgent).toHaveBeenCalledWith(
      expect.anything(),
      "engenty.copilot",
      expect.objectContaining({
        modelConfig: expect.objectContaining({
          chatModelId: "openai/requested",
          routingModelId: "openai/requested",
        }),
      })
    );
  });
});
