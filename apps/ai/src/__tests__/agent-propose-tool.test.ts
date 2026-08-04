// agent_propose contract: POSTs to the propose endpoint (never the direct
// create route), stamps the proposing agent, returns soft failures without
// throwing, and tells the model a human must approve before anything runs.

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentProposeTool } from "../../ai/tools/agent-propose-tool.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";

vi.mock("../notifications/inbox.js", () => ({
  emitInboxNotification: vi.fn(async () => undefined),
}));

const input = {
  id: "sales.researcher",
  name: "Sales Researcher",
  description: "Researches prospects before outreach.",
  instructions:
    "Standing mandate: research prospects thoroughly before any outreach.",
  tool_ids: ["engenty_tools_search"],
  skill_ids: [],
};

function runWithContext(
  ctx: Record<string, unknown>,
  fn: () => Promise<unknown>
) {
  return engentyToolsRunAls.run(ctx as never, fn);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agentProposeTool", () => {
  it("POSTs the config to the propose endpoint with agent attribution", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ record: { status: "proposed" } }),
    }));
    vi.stubGlobal("fetch", mockFetch);

    const result = (await runWithContext(
      {
        agentTypeKey: "engenty.coordinator",
        coreBaseUrl: "https://api.example.com",
        tenantId: "tenant-1",
        accessToken: "tok-123",
      },
      () =>
        agentProposeTool.execute?.(input as never, {} as never) as Promise<{
          ok: boolean;
          status?: string;
          pending_revision?: boolean;
          note?: string;
        }>
    )) as { ok: boolean; status?: string; note?: string };

    expect(result.ok).toBe(true);
    expect(result.status).toBe("proposed");
    expect(result.note).toContain("human must approve");

    const [url, init] = mockFetch.mock.calls[0] as unknown as [
      string,
      { method: string; body: string; headers: Record<string, string> },
    ];
    expect(url).toBe(
      "https://api.example.com/ai/registry/agents/sales.researcher/propose"
    );
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer tok-123");
    const body = JSON.parse(init.body);
    expect(body.proposed_by_agent).toBe("engenty.coordinator");
    expect(body.name).toBe("Sales Researcher");
    // A model is always sent (tenant/env default when the input omits one).
    expect(typeof body.model).toBe("string");
    expect(body.model.length).toBeGreaterThan(0);
  });

  it("reports a pending revision distinctly when the agent already exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          record: { status: "active", proposed_config: { name: "v2" } },
        }),
      }))
    );

    const result = (await runWithContext(
      { coreBaseUrl: "https://api.example.com", accessToken: "tok-123" },
      () =>
        agentProposeTool.execute?.(input as never, {} as never) as Promise<{
          pending_revision: boolean;
          note: string;
        }>
    )) as { pending_revision: boolean; note: string };
    expect(result.pending_revision).toBe(true);
    expect(result.note).toContain("revision");
  });

  it("soft-fails without a token and on HTTP errors (never throws)", async () => {
    const noAuth = (await runWithContext({}, () =>
      agentProposeTool.execute?.(input as never, {} as never)
    )) as { ok: boolean; code: string };
    expect(noAuth.ok).toBe(false);
    expect(noAuth.code).toBe("unauthorized");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "agent_sessions.invalidInput" }),
      }))
    );
    const httpError = (await runWithContext(
      { coreBaseUrl: "https://api.example.com", accessToken: "tok-123" },
      () => agentProposeTool.execute?.(input as never, {} as never)
    )) as { ok: boolean; message: string };
    expect(httpError.ok).toBe(false);
    expect(httpError.message).toContain("400");
  });
});
