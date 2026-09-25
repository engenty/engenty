// agent_propose: allow-listed new hires with a known space go live; anything
// wider stays a proposal a person approves.

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
const BASE = "https://api.example.com";
const AGENT_PATH = "/ai/registry/agents/sales.researcher";

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
    const path = String(url).replace(BASE, "");
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

const notFound = { method: "GET", path: AGENT_PATH, status: 404 };
const proposed = {
  body: { record: { status: "proposed" } },
  method: "POST",
  path: `${AGENT_PATH}/propose`,
  status: 200,
};
const created = {
  body: {
    agent: { id: "sales.researcher", status: "active" },
    mounted: [{ ok: true, spaceId: SPACE_ID }],
  },
  method: "POST",
  path: "/ai/registry/agents",
  status: 200,
};

function runWithContext(
  ctx: Record<string, unknown>,
  fn: () => Promise<unknown>
) {
  return engentyToolsRunAls.run(ctx as never, fn);
}

function isCreateCall([url, init]: unknown[]) {
  return (
    String(url) === `${BASE}/ai/registry/agents` &&
    (init as { method?: string })?.method === "POST"
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  emitInbox.mockClear();
  resetFrontendToolSuspendSlotsForTests();
});

describe("agentProposeTool", () => {
  it("only proposes a hire when the space is unknown", async () => {
    const mockFetch = mockRegistry([notFound, proposed]);

    const result = (await runWithContext(
      { accessToken: "tok-123", coreBaseUrl: BASE, tenantId: "tenant-1" },
      () => agentProposeTool.execute!(input as never, {} as never)
    )) as { status?: string };

    expect(result.status).toBe("proposed");
    expect(mockFetch.mock.calls.some(isCreateCall)).toBe(false);
    const proposeCall = mockFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/propose")
    ) as [string, { headers: Record<string, string> }];
    expect(proposeCall[1].headers.authorization).toBe("Bearer tok-123");
  });

  it("tells a routine hire that the routine is still owed", async () => {
    // The hire does not create the routine; the note is what makes the caller do it.
    mockRegistry([notFound, created]);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: BASE,
        space: { spaceId: SPACE_ID },
        tenantId: "tenant-1",
      },
      () =>
        agentProposeTool.execute!(
          { ...input, for_work: "routine" } as never,
          {} as never
        )
    )) as { note: string };

    expect(result.note).toContain("routines_create");
  });

  it("creates and mounts an allow-listed new hire when the space is known", async () => {
    const mockFetch = mockRegistry([notFound, created]);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: BASE,
        space: { spaceId: SPACE_ID },
        tenantId: "tenant-1",
      },
      () => agentProposeTool.execute!(input as never, {} as never)
    )) as { status: string };

    expect(result.status).toBe("active");
    const createCall = mockFetch.mock.calls.find(isCreateCall) as [
      string,
      { body: string },
    ];
    expect(JSON.parse(createCall[1].body).spaceIds).toEqual([SPACE_ID]);
    // No card was shown, so the inbox is how the person learns of the hire.
    expect(emitInbox).toHaveBeenCalledOnce();
    expect(emitInbox.mock.calls[0]?.[0]).toMatchObject({
      kind: "agent_hired",
    });
  });

  it("stamps the run's space on a gated proposal", async () => {
    const mockFetch = mockRegistry([notFound, proposed]);

    await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: BASE,
        space: { spaceId: SPACE_ID },
      },
      () => agentProposeTool.execute!(gatedInput as never, {} as never)
    );

    const proposeCall = mockFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/propose")
    ) as [string, { body: string }];
    expect(JSON.parse(proposeCall[1].body).proposed_space_id).toBe(SPACE_ID);
  });

  it("keeps a revision to an existing agent pending", async () => {
    const mockFetch = mockRegistry([
      {
        body: { agent: { id: "sales.researcher" } },
        method: "GET",
        path: AGENT_PATH,
        status: 200,
      },
      {
        body: {
          record: { status: "active", proposed_config: { name: "v2" } },
        },
        method: "POST",
        path: `${AGENT_PATH}/propose`,
        status: 200,
      },
    ]);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: BASE,
        space: { spaceId: SPACE_ID },
      },
      () => agentProposeTool.execute!(input as never, {} as never)
    )) as { pending_revision: boolean };

    expect(result.pending_revision).toBe(true);
    expect(mockFetch.mock.calls.some(isCreateCall)).toBe(false);
  });

  it("suspends a hire widget when gated and a human can answer", async () => {
    mockRegistry([notFound, proposed]);
    const suspend = vi.fn(async () => undefined);

    await runWithContext(
      {
        accessToken: "tok-123",
        canSuspendForInteraction: true,
        coreBaseUrl: BASE,
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
    const artifact = (suspend.mock.calls.at(0) as unknown[])[0] as {
      choices: Array<{ id: string }>;
      durable_inbox?: boolean;
    };
    expect(artifact.choices.map((choice) => choice.id)).toEqual([
      "approve",
      "reject",
    ]);
    // The propose route already filed the inbox row; the card must not add one.
    expect(artifact.durable_inbox).toBe(true);
    expect(emitInbox).not.toHaveBeenCalled();
  });

  it("does not suspend a gated hire on a headless run", async () => {
    mockRegistry([notFound, proposed]);
    const suspend = vi.fn(async () => undefined);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: BASE,
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
  });

  it("approves the parked proposal when the hire widget resumes Approve", async () => {
    mockRegistry([
      {
        body: {
          agent: { id: "sales.researcher" },
          mounted: [{ ok: true, spaceId: SPACE_ID }],
        },
        method: "POST",
        path: `${AGENT_PATH}/approve`,
        status: 200,
      },
    ]);

    const result = (await runWithContext(
      {
        accessToken: "tok-123",
        coreBaseUrl: BASE,
        space: { spaceId: SPACE_ID },
      },
      () =>
        agentProposeTool.execute!(
          gatedInput as never,
          {
            agent: { resumeData: { choice_id: "approve" } },
          } as never
        )
    )) as { status: string };

    expect(result.status).toBe("active");
  });

  it("rejects the parked proposal when the hire widget resumes Reject", async () => {
    mockRegistry([
      {
        body: { rejected: true },
        method: "POST",
        path: `${AGENT_PATH}/reject`,
        status: 200,
      },
    ]);

    const result = (await runWithContext(
      { accessToken: "tok-123", coreBaseUrl: BASE },
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
});
