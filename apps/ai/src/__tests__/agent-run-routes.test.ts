import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerAgentRunRoutes } from "../api/agent-run-routes.js";
import { createStaticAiScopeResolver } from "../api/http.js";
import type { AgentRunEventRow, AgentRunRow } from "../dal/threads/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const runId = "00000000-0000-4000-8000-000000000010";

const scopeResolver = createStaticAiScopeResolver({ tenantId, userId });

function makeRun(overrides: Partial<AgentRunRow> = {}): AgentRunRow {
  return {
    agent_id: "engenty.copilot",
    cancelled_at: null,
    completion_tokens: 8,
    created_by_user_id: userId,
    error_code: null,
    error_message: null,
    finished_at: "2026-05-21T00:00:02.000Z",
    id: runId,
    mastra_trace_id: null,
    metadata: {},
    model_id: "openai/gpt-4.1-mini",
    prompt_tokens: 4,
    thread_id: threadId,
    started_at: "2026-05-21T00:00:00.000Z",
    status: "completed",
    tenant_id: tenantId,
    ...overrides,
  };
}

function makeEvent(seq: number): AgentRunEventRow {
  return {
    created_at: "2026-05-21T00:00:01.000Z",
    event_type: seq === 0 ? "RUN_STARTED" : "RUN_FINISHED",
    id: `00000000-0000-4000-8000-0000000000${seq + 3}`,
    payload: { type: seq === 0 ? "RUN_STARTED" : "RUN_FINISHED" },
    run_id: runId,
    seq,
    thread_id: threadId,
    tenant_id: tenantId,
  };
}

describe("agent run routes", () => {
  it("lists runs, returns detail/events, and deletes", async () => {
    const run = makeRun();
    const runStore = {
      deleteRun: vi.fn(async () => ({ deleted: true })),
      deleteRunsForAgent: vi.fn(async () => ({ deleted: 1 })),
      getRun: vi.fn(async () => run),
      listRunEvents: vi.fn(async () => [makeEvent(0), makeEvent(1)]),
      listRunsForAgent: vi.fn(async () => [run]),
      listRunsForThread: vi.fn(async () => [run]),
      listRunsForTenant: vi.fn(async () => [run]),
    };
    const app = new Hono();
    registerAgentRunRoutes(app as never, {
      getRunStore: () => runStore as never,
      aiService: {
        threads: {
          getThread: vi.fn(async () => ({ thread: { id: threadId } })),
        },
      } as never,
      scopeResolver,
    });

    const listRes = await app.request(
      "http://localhost/ai/v1/runs?agent_id=engenty.copilot",
      { headers: { authorization: "Bearer test" } }
    );
    const detailRes = await app.request(
      `http://localhost/ai/v1/runs/${runId}`,
      { headers: { authorization: "Bearer test" } }
    );
    const eventsRes = await app.request(
      `http://localhost/ai/v1/runs/${runId}/events`,
      { headers: { authorization: "Bearer test" } }
    );
    const sessionRunsRes = await app.request(
      `http://localhost/ai/v1/threads/${threadId}/runs`,
      { headers: { authorization: "Bearer test" } }
    );
    const deleteRes = await app.request(
      `http://localhost/ai/v1/runs/${runId}`,
      { headers: { authorization: "Bearer test" }, method: "DELETE" }
    );

    expect(listRes.status).toBe(200);
    expect(detailRes.status).toBe(200);
    expect(eventsRes.status).toBe(200);
    expect(sessionRunsRes.status).toBe(200);
    expect(deleteRes.status).toBe(200);

    const eventsBody = (await eventsRes.json()) as {
      events: Array<{ seq: number }>;
    };
    expect(eventsBody.events.map((event) => event.seq)).toEqual([0, 1]);

    // With an agent filter → per-agent listing.
    expect(runStore.listRunsForAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "engenty.copilot" })
    );
    expect(runStore.listRunsForTenant).not.toHaveBeenCalled();
  });

  it("lists runs tenant-wide when no agent filter is given (global activity feed)", async () => {
    const run = makeRun();
    const runStore = {
      listRunsForAgent: vi.fn(async () => [run]),
      listRunsForTenant: vi.fn(async () => [run]),
    };
    const app = new Hono();
    registerAgentRunRoutes(app as never, {
      getRunStore: () => runStore as never,
      aiService: { threads: {} } as never,
      scopeResolver,
    });

    const listRes = await app.request("http://localhost/ai/v1/runs?limit=50", {
      headers: { authorization: "Bearer test" },
    });

    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as { runs: unknown[] };
    expect(body.runs).toHaveLength(1);
    expect(runStore.listRunsForTenant).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 })
    );
    expect(runStore.listRunsForAgent).not.toHaveBeenCalled();
  });
});
