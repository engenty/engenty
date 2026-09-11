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

describe("admin run routes", () => {
  const superAdminResolver = createStaticAiScopeResolver({
    isSuperAdmin: true,
    tenantId,
    userId,
  });

  it("lists, loads, and returns events across tenants for a superadmin", async () => {
    const run = makeRun();
    const runStore = {
      describePlatformRuns: vi.fn(async () => ({
        models: new Map([
          [
            "openai/gpt-4.1-mini",
            {
              displayName: "GPT-4.1 mini",
              inputPerMtokMicros: 400_000,
              outputPerMtokMicros: 1_600_000,
            },
          ],
        ]),
        threadSpaceIds: new Map([[threadId, null]]),
        threadTitles: new Map([[threadId, "Q3 close"]]),
      })),
      getRunById: vi.fn(async () => run),
      listRunEventsByRunId: vi.fn(async () => [makeEvent(0), makeEvent(1)]),
      listRunsForPlatform: vi.fn(async () => [run]),
      listRunsForPlatformThread: vi.fn(async () => [run]),
    };
    const app = new Hono();
    registerAgentRunRoutes(app as never, {
      getRunStore: () => runStore as never,
      aiService: { threads: {} } as never,
      scopeResolver: superAdminResolver,
    });

    const listRes = await app.request(
      `http://localhost/ai/v1/admin/runs?tenant_id=${tenantId}&status=succeeded&limit=20`,
      { headers: { authorization: "Bearer test" } }
    );
    const detailRes = await app.request(
      `http://localhost/ai/v1/admin/runs/${runId}`,
      { headers: { authorization: "Bearer test" } }
    );
    const eventsRes = await app.request(
      `http://localhost/ai/v1/admin/runs/${runId}/events`,
      { headers: { authorization: "Bearer test" } }
    );

    expect(listRes.status).toBe(200);
    expect(detailRes.status).toBe(200);
    expect(eventsRes.status).toBe(200);
    expect(runStore.listRunsForPlatform).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        status: "completed",
        tenantId,
      })
    );
    expect(runStore.getRunById).toHaveBeenCalledWith(runId);
    expect(runStore.listRunEventsByRunId).toHaveBeenCalledWith({ runId });
    const listBody = (await listRes.json()) as {
      runs: Array<{
        cost_usd: number | null;
        model_display_name: string | null;
        model_id: string | null;
        thread_title: string | null;
      }>;
    };
    expect(listBody.runs[0]).toMatchObject({
      model_display_name: "GPT-4.1 mini",
      model_id: "openai/gpt-4.1-mini",
      thread_title: "Q3 close",
    });
    expect(listBody.runs[0]?.cost_usd).toBeGreaterThan(0);
  });

  it("returns thread runs with neighbors and children for a superadmin", async () => {
    const first = makeRun();
    const second = makeRun({
      id: "00000000-0000-4000-8000-000000000011",
      started_at: "2026-05-21T00:00:03.000Z",
      finished_at: "2026-05-21T00:00:05.000Z",
    });
    const child = makeRun({
      agent_id: "sales.researcher",
      id: "00000000-0000-4000-8000-000000000012",
      metadata: {
        parent_run_id: runId,
        parent_thread_id: threadId,
        parent_tool_call_id: "tool-1",
      },
      thread_id: "00000000-0000-4000-8000-000000000004",
    });
    const describePlatformRuns = vi.fn(async () => ({
      models: new Map(),
      threadSpaceIds: new Map([
        [threadId, "00000000-0000-4000-8000-000000000020"],
      ]),
      threadTitles: new Map([[threadId, "Q3 close"]]),
    }));
    const runStore = {
      describePlatformRuns,
      getPlatformThread: vi.fn(async () => ({
        agent_id: "engenty.copilot",
        created_at: "2026-05-21T00:00:00.000Z",
        id: threadId,
        space_id: "00000000-0000-4000-8000-000000000020",
        tenant_id: tenantId,
        title: "Q3 close",
      })),
      getRunById: vi.fn(async () => first),
      listChildRunsForParentThread: vi.fn(async () => [child]),
      listPlatformThreadIdsByLatestRun: vi.fn(async () => [threadId]),
      listPlatformThreadsByIds: vi.fn(async () => [
        {
          agent_id: "engenty.copilot",
          created_at: "2026-05-21T00:00:00.000Z",
          id: threadId,
          space_id: "00000000-0000-4000-8000-000000000020",
          tenant_id: tenantId,
          title: "Q3 close",
        },
      ]),
      listRunEventsByRunIds: vi.fn(async () => [makeEvent(0), makeEvent(1)]),
      listRunsForPlatformThread: vi.fn(async () => [first, second]),
    };
    const app = new Hono();
    registerAgentRunRoutes(app as never, {
      getRunStore: () => runStore as never,
      aiService: { threads: {} } as never,
      scopeResolver: superAdminResolver,
    });

    const threadRes = await app.request(
      `http://localhost/ai/v1/admin/threads/${threadId}`,
      { headers: { authorization: "Bearer test" } }
    );
    const listRes = await app.request(
      "http://localhost/ai/v1/admin/threads?limit=20",
      { headers: { authorization: "Bearer test" } }
    );
    const eventsRes = await app.request(
      `http://localhost/ai/v1/admin/threads/${threadId}/events?limitRuns=20`,
      { headers: { authorization: "Bearer test" } }
    );
    const detailRes = await app.request(
      `http://localhost/ai/v1/admin/runs/${runId}`,
      { headers: { authorization: "Bearer test" } }
    );

    expect(threadRes.status).toBe(200);
    expect(listRes.status).toBe(200);
    expect(eventsRes.status).toBe(200);
    expect(detailRes.status).toBe(200);

    const threadBody = (await threadRes.json()) as {
      children: Array<{ parent_run_id: string | null }>;
      rollup: { turns: number };
      runs: Array<{
        next_run_id: string | null;
        prev_run_id: string | null;
        thread_run_index: number | null;
      }>;
      thread: { id: string; space_id: string | null };
    };
    expect(threadBody.thread.id).toBe(threadId);
    expect(threadBody.thread.space_id).toBe(
      "00000000-0000-4000-8000-000000000020"
    );
    expect(threadBody.rollup.turns).toBe(2);
    expect(threadBody.runs[0]).toMatchObject({
      next_run_id: second.id,
      prev_run_id: null,
      thread_run_index: 1,
    });
    expect(threadBody.runs[1]).toMatchObject({
      next_run_id: null,
      prev_run_id: first.id,
      thread_run_index: 2,
    });
    expect(threadBody.children[0]?.parent_run_id).toBe(runId);

    const listBody = (await listRes.json()) as {
      threads: Array<{ rollup: { turns: number }; thread: { id: string } }>;
    };
    expect(listBody.threads).toHaveLength(1);
    expect(listBody.threads[0]?.rollup.turns).toBe(2);

    const eventsBody = (await eventsRes.json()) as {
      events: Array<{ seq: number }>;
      run_ids: string[];
    };
    expect(eventsBody.run_ids).toEqual([first.id, second.id]);
    expect(eventsBody.events.map((event) => event.seq)).toEqual([0, 1]);

    const detailBody = (await detailRes.json()) as {
      run: { next_run_id: string | null; thread_run_index: number | null };
    };
    expect(detailBody.run.next_run_id).toBe(second.id);
    expect(detailBody.run.thread_run_index).toBe(1);
  });

  it("rejects a non-superadmin from admin threads with 403", async () => {
    const runStore = {
      listPlatformThreadIdsByLatestRun: vi.fn(async () => []),
    };
    const app = new Hono();
    registerAgentRunRoutes(app as never, {
      getRunStore: () => runStore as never,
      aiService: { threads: {} } as never,
      scopeResolver,
    });
    const listRes = await app.request("http://localhost/ai/v1/admin/threads", {
      headers: { authorization: "Bearer test" },
    });
    expect(listRes.status).toBe(403);
    expect(runStore.listPlatformThreadIdsByLatestRun).not.toHaveBeenCalled();
  });

  it("returns 404 when the platform thread is missing", async () => {
    const runStore = {
      getPlatformThread: vi.fn(async () => null),
    };
    const app = new Hono();
    registerAgentRunRoutes(app as never, {
      getRunStore: () => runStore as never,
      aiService: { threads: {} } as never,
      scopeResolver: superAdminResolver,
    });
    const res = await app.request(
      `http://localhost/ai/v1/admin/threads/${threadId}`,
      { headers: { authorization: "Bearer test" } }
    );
    expect(res.status).toBe(404);
  });

  it("reconstructs a prompt preview for a superadmin using the run's tenant", async () => {
    const run = makeRun();
    const preview = { agent_id: "engenty.copilot", system: { text: "SOUL" } };
    const getThreadPromptPreview = vi.fn(async () => preview);
    const runStore = {
      getRunById: vi.fn(async () => run),
    };
    const app = new Hono();
    registerAgentRunRoutes(app as never, {
      getRunStore: () => runStore as never,
      aiService: { threads: { getThreadPromptPreview } } as never,
      scopeResolver: superAdminResolver,
    });

    const res = await app.request(
      `http://localhost/ai/v1/admin/runs/${runId}/prompt-preview`,
      { headers: { authorization: "Bearer test" } }
    );
    expect(res.status).toBe(200);
    expect(getThreadPromptPreview).toHaveBeenCalledWith({
      scope: expect.objectContaining({
        isSuperAdmin: true,
        tenantId,
      }),
      threadId,
    });
    const body = (await res.json()) as { preview: { agent_id: string } };
    expect(body.preview.agent_id).toBe("engenty.copilot");
  });

  it("rejects a non-superadmin with 403", async () => {
    const runStore = {
      listRunsForPlatform: vi.fn(async () => []),
    };
    const app = new Hono();
    registerAgentRunRoutes(app as never, {
      getRunStore: () => runStore as never,
      aiService: { threads: {} } as never,
      scopeResolver,
    });

    const listRes = await app.request("http://localhost/ai/v1/admin/runs", {
      headers: { authorization: "Bearer test" },
    });
    expect(listRes.status).toBe(403);
    expect(runStore.listRunsForPlatform).not.toHaveBeenCalled();
  });
});
