import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerAgentRunRoutes } from "../api/agent-run-routes.js";
import { createStaticAiScopeResolver } from "../api/http.js";
import type { AgentRunRow } from "../dal/threads/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const runId = "00000000-0000-4000-8000-000000000010";

const scopeResolver = createStaticAiScopeResolver({ tenantId, userId });

function makeRun(): AgentRunRow {
  return {
    agent_id: "engenty.copilot",
    cancelled_at: null,
    completion_tokens: 8,
    context_prompt_tokens: null,
    created_by_user_id: userId,
    error_code: null,
    error_message: null,
    finished_at: "2026-05-21T00:00:02.000Z",
    trigger: "message",
    id: runId,
    mastra_trace_id: null,
    metadata: {},
    model_id: "openai/gpt-4.1-mini",
    prompt_tokens: 4,
    thread_id: threadId,
    started_at: "2026-05-21T00:00:00.000Z",
    status: "completed",
    tenant_id: tenantId,
  };
}

function makeApp(runStore: Record<string, unknown>) {
  const app = new Hono();
  registerAgentRunRoutes(app as never, {
    getRunStore: () => runStore as never,
    aiService: { threads: {} } as never,
    scopeResolver,
  });
  return app;
}

describe("agent run routes", () => {
  it("loads a run in the caller's tenant", async () => {
    const runStore = { getRun: vi.fn(async () => makeRun()) };
    const app = makeApp(runStore);

    const res = await app.request(`http://localhost/ai/v1/runs/${runId}`, {
      headers: { authorization: "Bearer test" },
    });

    expect(res.status).toBe(200);
    expect(runStore.getRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId, tenantId })
    );
  });
});

describe("admin run routes", () => {
  it("rejects a non-superadmin from admin threads with 403", async () => {
    const runStore = {
      listPlatformThreadIdsByLatestRun: vi.fn(async () => []),
    };
    const app = makeApp(runStore);

    const res = await app.request("http://localhost/ai/v1/admin/threads", {
      headers: { authorization: "Bearer test" },
    });

    expect(res.status).toBe(403);
    expect(runStore.listPlatformThreadIdsByLatestRun).not.toHaveBeenCalled();
  });

  it("rejects a non-superadmin from admin runs with 403", async () => {
    const runStore = { listRunsForPlatform: vi.fn(async () => []) };
    const app = makeApp(runStore);

    const res = await app.request("http://localhost/ai/v1/admin/runs", {
      headers: { authorization: "Bearer test" },
    });

    expect(res.status).toBe(403);
    expect(runStore.listRunsForPlatform).not.toHaveBeenCalled();
  });
});
