// The repair endpoint's contract: it re-validates server-side, refuses to
// pretend (no version when nothing improved), answers a user's stop
// distinctly, and never trusts the client's issue list.
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ai/workflows/draft-from-description.js", () => ({
  DRAFT_CANCELLED: "draft_cancelled",
  draftGraphFromDescription: vi.fn(),
  repairGraphIssues: vi.fn(),
}));
vi.mock("../../ai/workflows/validate-graph.js", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../ai/workflows/validate-graph.js")
    >();
  return { ...original, validateGraphAction: vi.fn() };
});

import { repairGraphIssues } from "../../ai/workflows/draft-from-description.js";
import { validateGraphAction } from "../../ai/workflows/validate-graph.js";
import { registerWorkflowRoutes } from "../workflow-routes.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const GRAPH_ID = "graph-1";
const VERSION_ID = "version-1";

const repairMock = vi.mocked(repairGraphIssues);
const validateMock = vi.mocked(validateGraphAction);

const ISSUE = {
  code: "unknown-tool" as const,
  entryId: "send",
  message: "toolId 'nope' is not a registered tool",
  path: "graph[1]",
};

const STORED_VERSION = {
  workflow_id: GRAPH_ID,
  graph: {
    graph: [{ id: "send", toolId: "nope", type: "tool" }],
    id: `workflow:${GRAPH_ID}`,
    inputSchema: { properties: {}, type: "object" },
    outputSchema: { properties: {}, type: "object" },
  },
  id: VERSION_ID,
  version: 1,
};

function buildApp() {
  const store = {
    getGraph: vi.fn().mockResolvedValue({
      context_type: null,
      description: "send things",
      id: GRAPH_ID,
      name: "Test flow",
    }),
    getVersion: vi.fn().mockResolvedValue(STORED_VERSION),
    saveVersion: vi.fn().mockResolvedValue({ id: "version-2", version: 2 }),
  };
  const app = new Hono();
  registerWorkflowRoutes(app as never, {
    getWorkflowStore: () => store as never,
    getWorkflowRunStore: () => null,
    scopeResolver: () =>
      Promise.resolve({
        ok: true as const,
        scope: { tenantId: TENANT_ID, userId: USER_ID },
      } as never),
  });
  return { app, store };
}

function postRepair(app: Hono, body: Record<string, unknown>) {
  return app.request(`/ai/v1/workflows/${GRAPH_ID}/repair`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

beforeEach(() => {
  repairMock.mockReset();
  validateMock.mockReset();
  validateMock.mockReturnValue([ISSUE]);
  repairMock.mockResolvedValue({
    graph: {
      graph: [{ id: "send", toolId: "engenty_tool", type: "tool" }],
      id: `workflow:${GRAPH_ID}`,
      inputSchema: { properties: {}, type: "object" },
      outputSchema: { properties: {}, type: "object" },
    },
    improved: true,
    issues: [],
  });
});

describe("POST /ai/v1/workflows/:id/repair", () => {
  it("requires a version_id", async () => {
    const { app } = buildApp();
    const res = await postRepair(app, {});
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "workflows.versionRequired",
    });
  });

  it("rejects a malformed run_id before any model work", async () => {
    const { app } = buildApp();
    const res = await postRepair(app, {
      run_id: "nope",
      version_id: VERSION_ID,
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "workflows.invalidRunId",
    });
    expect(repairMock).not.toHaveBeenCalled();
  });

  it("refuses when the stored version has nothing to fix", async () => {
    const { app } = buildApp();
    validateMock.mockReturnValue([]);
    const res = await postRepair(app, { version_id: VERSION_ID });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "workflows.nothingToFix",
    });
    expect(repairMock).not.toHaveBeenCalled();
  });

  it("validates server-side and passes instruction + run id to the repairer", async () => {
    const { app } = buildApp();
    const res = await postRepair(app, {
      instruction: "use engenty_tool",
      run_id: RUN_ID,
      version_id: VERSION_ID,
    });
    expect(res.status).toBe(201);
    expect(repairMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: "use engenty_tool",
        issues: [ISSUE],
        name: "Test flow",
        runId: RUN_ID,
      })
    );
  });

  it("saves the improved graph as a copilot-authored version", async () => {
    const { app, store } = buildApp();
    const res = await postRepair(app, { version_id: VERSION_ID });
    expect(res.status).toBe(201);
    const payload = (await res.json()) as Record<string, unknown>;
    expect(payload.improved).toBe(true);
    expect(store.saveVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: GRAPH_ID,
        authoredBy: "copilot",
      })
    );
  });

  it("saves nothing when the round did not improve", async () => {
    const { app, store } = buildApp();
    repairMock.mockResolvedValue({
      graph: STORED_VERSION.graph as never,
      improved: false,
      issues: [ISSUE],
    });
    const res = await postRepair(app, { version_id: VERSION_ID });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      improved: false,
      issues: [ISSUE],
    });
    expect(store.saveVersion).not.toHaveBeenCalled();
  });

  it("answers a stopped repair distinctly, not as a failure", async () => {
    const { app, store } = buildApp();
    repairMock.mockRejectedValue(new Error("draft_cancelled"));
    const res = await postRepair(app, { version_id: VERSION_ID });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "workflows.draftCancelled",
    });
    expect(store.saveVersion).not.toHaveBeenCalled();
  });

  it("404s on a version from a different graph", async () => {
    const { app, store } = buildApp();
    store.getVersion.mockResolvedValue({
      ...STORED_VERSION,
      workflow_id: "someone-elses-graph",
    });
    const res = await postRepair(app, { version_id: VERSION_ID });
    expect(res.status).toBe(404);
  });
});
