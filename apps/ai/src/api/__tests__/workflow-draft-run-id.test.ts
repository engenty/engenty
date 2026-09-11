// The draft endpoint's `run_id` is the handle a client attaches the run
// stream to while drafting is still running — these tests pin the contract:
// a malformed id is rejected before any model work starts, a valid or absent
// id drafts normally, and the id actually reaches the drafter.
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ai/workflows/draft-from-description.js", () => ({
  DRAFT_CANCELLED: "draft_cancelled",
  draftGraphFromDescription: vi.fn(),
}));

import { draftGraphFromDescription } from "../../ai/workflows/draft-from-description.js";
import { registerWorkflowRoutes } from "../workflow-routes.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

const draftMock = vi.mocked(draftGraphFromDescription);

function buildApp() {
  const store = {
    create: vi.fn().mockResolvedValue({ id: "graph-1", name: "Test" }),
    saveVersion: vi.fn().mockResolvedValue({ id: "version-1" }),
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

function postDraft(app: Hono, body: Record<string, unknown>) {
  return app.request("/ai/v1/workflows/draft", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

beforeEach(() => {
  draftMock.mockReset();
  draftMock.mockResolvedValue({
    graph: {
      graph: [],
      id: "workflow:pending",
      inputSchema: { properties: {}, type: "object" },
      outputSchema: { properties: {}, type: "object" },
    },
    issues: [],
  });
});

describe("POST /ai/v1/workflows/draft run_id", () => {
  it("rejects a malformed run_id before any drafting work", async () => {
    const { app } = buildApp();
    const res = await postDraft(app, {
      description: "do things",
      name: "Test",
      run_id: "not-a-uuid",
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "workflows.invalidRunId",
    });
    expect(draftMock).not.toHaveBeenCalled();
  });

  it("passes a valid run_id through to the drafter", async () => {
    const { app } = buildApp();
    const res = await postDraft(app, {
      description: "do things",
      name: "Test",
      run_id: RUN_ID,
    });
    expect(res.status).toBe(201);
    expect(draftMock).toHaveBeenCalledWith(
      expect.objectContaining({ runId: RUN_ID })
    );
  });

  it("still drafts without a run_id (old-client shape)", async () => {
    const { app } = buildApp();
    const res = await postDraft(app, {
      description: "do things",
      name: "Test",
    });
    expect(res.status).toBe(201);
    expect(draftMock).toHaveBeenCalledTimes(1);
    expect(draftMock.mock.calls[0]?.[0]).not.toHaveProperty("runId");
  });

  it("answers a cancelled draft distinctly, not as a failure", async () => {
    const { app, store } = buildApp();
    draftMock.mockRejectedValue(new Error("draft_cancelled"));
    const res = await postDraft(app, {
      description: "do things",
      name: "Test",
      run_id: RUN_ID,
    });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "workflows.draftCancelled",
    });
    // A cancelled draft must leave nothing behind.
    expect(store.create).not.toHaveBeenCalled();
  });
});
