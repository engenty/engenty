// agent_propose: allow-listed new hires create+mount; extra tools/skills/
// revisions/missing space stay proposed; the propose HTTP route files the
// inbox row; interactive runs suspend a hire widget.

import { LIVE_HIRE_TOOL_IDS } from "@engenty/ai-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFrontendToolSuspendSlotsForTests } from "../../ai/frontend-tools/frontend-tool-suspend-lock.js";
import { agentProposeTool } from "../../ai/tools/agent-propose-tool.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { emitInboxNotification } from "../notifications/inbox.js";

vi.mock("../notifications/inbox.js", () => ({
  emitInboxNotification: vi.fn(async () => undefined),
}));

const emitInbox = vi.mocked(emitInboxNotification);

const input = {
  id: "sales.researcher",
  name: "Sales Researcher",
  description: "Researches prospects before outreach.",
  // Required: the hire has to say what it is hiring FOR, because a hire for
  // recurring work is only half the job.
  for_work: "tasks" as const,
  instructions:
    "Standing mandate: research prospects thoroughly before any outreach.",
  tool_ids: ["engenty_tools_search"],
  skill_ids: [],
};

const gatedInput = {
  ...input,
  tool_ids: ["engenty_tools_search", "space_setup"],
};

const SPACE_ID = "00000000-0000-4000-8000-000000000010";

function jsonRes(status: number, body: unknown) {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status,
  };
}

function mockRegistry(
  handlers: Array<{
    body?: unknown;
    method: string;
    path: string;
    status: number;
  }>
) {
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const path = String(url).replace("https://api.example.com", "");
    const match = handlers.find(
      (handler) => handler.method === method && handler.path === path
    );
    if (!match) {
      return jsonRes(599, { error: `unmocked ${method} ${path}` });
    }
    return jsonRes(match.status, match.body ?? {});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function runWithContext(
  ctx: Record<string, unknown>,
  fn: () => Promise<unknown>
) {
  return engentyToolsRunAls.run(ctx as never, fn);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  emitInbox.mockClear();
  resetFrontendToolSuspendSlotsForTests();
});

describe("agentProposeTool", () => {
  it("POSTs the config to the propose endpoint when the space is unknown", async () => {
    const mockFetch = mockRegistry([
      {
        method: "GET",
        path: "/ai/registry/agents/sales.researcher",
        status: 404,
      },
      {
        body: { record: { status: "proposed" } },
        method: "POST",
        path: "/ai/registry/agents/sales.researcher/propose",
        status: 200,
      },
    ]);

    const result = (await runWithContext(
      {
        agentTypeKey: "engenty.coordinator",
        coreBaseUrl: "https://api.example.com",
        tenantId: "tenant-1",
        accessToken: "tok-123",
      },
      () => agentProposeTool.execute!(input as never, {} as never)
    )) as { ok: boolean; status?: string; note?: string };

    expect(result.ok).toBe(true);
    expect(result.status).toBe("proposed");
    expect(result.note).toContain("proposed");
    // Inbox is the propose route's job — this test stubs that HTTP call.
    expect(emitInbox).not.toHaveBeenCalled();

    const proposeCall = mockFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/propose")
    ) as [
      string,
      { method: string; body: string; headers: Record<string, string> },
    ];
    expect(proposeCall[0]).toBe(
      "https://api.example.com/ai/registry/agents/sales.researcher/propose"
    );
    expect(proposeCall[1].method).toBe("POST");
    expect(proposeCall[1].headers.authorization).toBe("Bearer tok-123");
    const body = JSON.parse(proposeCall[1].body);
    expect(body.agentScope).toBe("shared");
    expect(body.proposed_by_agent).toBe("engenty.coordinator");
    expect(body.proposed_space_id).toBeNull();
    expect(body.name).toBe("Sales Researcher");
    expect(typeof body.model).toBe("string");
    expect(body.model.length).toBeGreaterThan(0);
  });

  it("tells a routine hire that the routine is still owed", async () => {
    mockRegistry([
      {
        method: "GET",
        path: "/ai/registry/agents/sales.researcher",
        status: 404,
      },
      {
        body: {
          agent: { id: "sales.researcher", status: "active" },
          mounted: [{ ok: true, spaceId: SPACE_ID }],
        },
        method: "POST",
        path: "/ai/registry/agents",
        status: 200,
      },
    ]);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: "https://api.example.com",
        space: { spaceId: SPACE_ID },
        tenantId: "tenant-1",
      },
      () =>
        agentProposeTool.execute!(
          { ...input, for_work: "routine" } as never,
          {} as never
        )
    )) as { note: string; status: string };

    // Live 2026-08-24: the hire answered "message it with message_agent now",
    // so the copilot announced the new agent and created no routine — an agent
    // that existed and did nothing. The note names the unfinished half.
    expect(result.status).toBe("active");
    expect(result.note).toContain("routines_create");
    expect(result.note).toContain("sales.researcher");
    expect(result.note).toContain("NO job yet");
  });

  it("creates and mounts an allow-listed new hire when the space is known", async () => {
    const mockFetch = mockRegistry([
      {
        method: "GET",
        path: "/ai/registry/agents/sales.researcher",
        status: 404,
      },
      {
        body: {
          agent: { id: "sales.researcher", status: "active" },
          mounted: [{ ok: true, spaceId: SPACE_ID }],
        },
        method: "POST",
        path: "/ai/registry/agents",
        status: 200,
      },
    ]);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: "https://api.example.com",
        space: { spaceId: SPACE_ID },
        tenantId: "tenant-1",
      },
      () => agentProposeTool.execute!(input as never, {} as never)
    )) as { mounted: unknown; note: string; ok: boolean; status: string };

    expect(result.ok).toBe(true);
    expect(result.status).toBe("active");
    expect(result.note).toContain("active");
    expect(result.mounted).toEqual([{ ok: true, spaceId: SPACE_ID }]);
    // No card was shown, so the person learns of the hire from the inbox: one
    // `update` row, never a decision (nothing is waiting on them).
    expect(emitInbox).toHaveBeenCalledOnce();
    expect(emitInbox.mock.calls[0]?.[0]).toMatchObject({
      kind: "agent_hired",
      metadata: { agent_id: "sales.researcher" },
      spaceId: SPACE_ID,
      subject: { id: "sales.researcher", type: "agent" },
    });

    const createCall = mockFetch.mock.calls.find(
      ([url, init]) =>
        String(url) === "https://api.example.com/ai/registry/agents" &&
        (init as { method?: string })?.method === "POST"
    ) as [string, { body: string }];
    const body = JSON.parse(createCall[1].body);
    expect(body.id).toBe("sales.researcher");
    expect(body.spaceIds).toEqual([SPACE_ID]);
    // The catalog floor is never lost, whatever the hire declared: an agent
    // that cannot reach engenty_tool_execute cannot do module work at all.
    // Approvals remain the boundary — the floor only restores the path.
    expect(body.toolIds).toEqual([
      ...LIVE_HIRE_TOOL_IDS,
      "show_objects",
      "show_artifact",
    ]);
    expect(body.skillIds).toEqual([
      "space-data",
      "app-authoring",
      "engenty-bridge",
      "routines",
    ]);
    expect(typeof body.engenty).toBe("string");
  });

  it("stamps the run's space on a gated proposal", async () => {
    const mockFetch = mockRegistry([
      {
        method: "GET",
        path: "/ai/registry/agents/sales.researcher",
        status: 404,
      },
      {
        body: { record: { status: "proposed" } },
        method: "POST",
        path: "/ai/registry/agents/sales.researcher/propose",
        status: 200,
      },
    ]);

    await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: "https://api.example.com",
        space: { spaceId: SPACE_ID },
      },
      () => agentProposeTool.execute!(gatedInput as never, {} as never)
    );

    const proposeCall = mockFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/propose")
    ) as [string, { body: string }];
    expect(JSON.parse(proposeCall[1].body).proposed_space_id).toBe(SPACE_ID);
  });

  it("reports a pending revision distinctly when the agent already exists", async () => {
    mockRegistry([
      {
        body: { agent: { id: "sales.researcher" } },
        method: "GET",
        path: "/ai/registry/agents/sales.researcher",
        status: 200,
      },
      {
        body: {
          record: { status: "active", proposed_config: { name: "v2" } },
        },
        method: "POST",
        path: "/ai/registry/agents/sales.researcher/propose",
        status: 200,
      },
    ]);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: "https://api.example.com",
        space: { spaceId: SPACE_ID },
      },
      () => agentProposeTool.execute!(input as never, {} as never)
    )) as { pending_revision: boolean; note: string };

    expect(result.pending_revision).toBe(true);
    expect(result.note).toContain("revision");
  });

  it("suspends a hire widget when gated and a human can answer", async () => {
    mockRegistry([
      {
        method: "GET",
        path: "/ai/registry/agents/sales.researcher",
        status: 404,
      },
      {
        body: { record: { status: "proposed" } },
        method: "POST",
        path: "/ai/registry/agents/sales.researcher/propose",
        status: 200,
      },
    ]);
    const suspend = vi.fn(async () => undefined);

    await runWithContext(
      {
        accessToken: "tok-123",
        canSuspendForInteraction: true,
        coreBaseUrl: "https://api.example.com",
        space: { spaceId: SPACE_ID },
        tenantId: "tenant-1",
      },
      () =>
        agentProposeTool.execute!(
          gatedInput as never,
          {
            agent: { suspend },
          } as never
        )
    );

    expect(suspend).toHaveBeenCalledOnce();
    const firstCall = suspend.mock.calls.at(0) as unknown[] | undefined;
    expect(firstCall).toBeDefined();
    const artifact = firstCall?.[0] as {
      artifact_type: string;
      choices: Array<{ id: string }>;
      title: string;
    };
    expect(artifact.artifact_type).toBe("decision");
    expect(artifact.title).toContain("Sales Researcher");
    expect(artifact.choices.map((choice) => choice.id)).toEqual([
      "approve",
      "reject",
    ]);
    expect((artifact as { durable_inbox?: boolean }).durable_inbox).toBe(true);
    expect(emitInbox).not.toHaveBeenCalled();
  });

  it("does not suspend a gated hire on a headless run", async () => {
    mockRegistry([
      {
        method: "GET",
        path: "/ai/registry/agents/sales.researcher",
        status: 404,
      },
      {
        body: { record: { status: "proposed" } },
        method: "POST",
        path: "/ai/registry/agents/sales.researcher/propose",
        status: 200,
      },
    ]);
    const suspend = vi.fn(async () => undefined);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: "https://api.example.com",
        space: { spaceId: SPACE_ID },
        tenantId: "tenant-1",
      },
      () =>
        agentProposeTool.execute!(
          gatedInput as never,
          {
            agent: { suspend },
          } as never
        )
    )) as { status: string };

    expect(suspend).not.toHaveBeenCalled();
    expect(result.status).toBe("proposed");
    // Headless still POSTs /propose; that route files `agent_proposed`.
    expect(emitInbox).not.toHaveBeenCalled();
  });

  it("approves the parked proposal when the hire widget resumes Approve", async () => {
    mockRegistry([
      {
        body: {
          agent: { id: "sales.researcher" },
          mounted: [{ ok: true, spaceId: SPACE_ID }],
        },
        method: "POST",
        path: "/ai/registry/agents/sales.researcher/approve",
        status: 200,
      },
    ]);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: "https://api.example.com",
        space: { spaceId: SPACE_ID },
      },
      () =>
        agentProposeTool.execute!(
          gatedInput as never,
          {
            agent: { resumeData: { choice_id: "approve" } },
          } as never
        )
    )) as { note: string; ok: boolean; status: string };

    expect(result.ok).toBe(true);
    expect(result.status).toBe("active");
    expect(result.note).toContain("approved");
  });

  it("rejects the parked proposal when the hire widget resumes Reject", async () => {
    mockRegistry([
      {
        body: { rejected: true },
        method: "POST",
        path: "/ai/registry/agents/sales.researcher/reject",
        status: 200,
      },
    ]);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: "https://api.example.com",
      },
      () =>
        agentProposeTool.execute!(
          gatedInput as never,
          {
            agent: { resumeData: { choice_id: "reject" } },
          } as never
        )
    )) as { status: string };

    expect(result.status).toBe("rejected");
  });

  it("soft-fails without a token and on HTTP errors (never throws)", async () => {
    const noAuth = (await runWithContext({}, () =>
      agentProposeTool.execute!(input as never, {} as never)
    )) as { ok: boolean; code: string };
    expect(noAuth.ok).toBe(false);
    expect(noAuth.code).toBe("unauthorized");

    mockRegistry([
      {
        method: "GET",
        path: "/ai/registry/agents/sales.researcher",
        status: 404,
      },
      {
        body: { error: "agent_registry.invalidInput" },
        method: "POST",
        path: "/ai/registry/agents/sales.researcher/propose",
        status: 400,
      },
    ]);
    const httpError = (await runWithContext(
      { coreBaseUrl: "https://api.example.com", accessToken: "tok-123" },
      () => agentProposeTool.execute!(input as never, {} as never)
    )) as { ok: boolean; message: string };
    expect(httpError.ok).toBe(false);
    expect(httpError.message).toContain("400");
  });

  it("creates a live hire when ALS has a token but no coreBaseUrl", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.example.com");
    mockRegistry([
      {
        method: "GET",
        path: "/ai/registry/agents/sales.researcher",
        status: 404,
      },
      {
        body: {
          agent: { id: "sales.researcher", status: "active" },
          mounted: [{ ok: true, spaceId: SPACE_ID }],
        },
        method: "POST",
        path: "/ai/registry/agents",
        status: 200,
      },
    ]);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        space: { spaceId: SPACE_ID },
        tenantId: "tenant-1",
      },
      () => agentProposeTool.execute!(input as never, {} as never)
    )) as { ok: boolean; status: string };

    expect(result.ok).toBe(true);
    expect(result.status).toBe("active");
  });
});
