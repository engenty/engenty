import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

// The audit record is where the route's approval verdict (approve_once /
// approve_always / deny) becomes observable.
const auditToolApprovalDecision = vi.fn();
vi.mock("../ai/sessions/tool-approval-audit.js", () => ({
  auditToolApprovalDecision: (...args: unknown[]) =>
    auditToolApprovalDecision(...args),
}));

import {
  claimResumeInFlight,
  releaseResumeInFlight,
} from "../ai/conversation/resume-claims.js";
import { AiSessionError } from "../ai/errors.js";
import { createStaticAiScopeResolver } from "../api/http.js";
import { registerThreadRunRoutes } from "../api/thread-run-routes.js";
import type { ThreadMessageRow, ThreadRow } from "../dal/threads/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const messageId = "00000000-0000-4000-8000-000000000004";
const runId = "run-1";

const scopeResolver = createStaticAiScopeResolver({
  tenantId,
  userId,
});

function makeSession(): ThreadRow {
  return {
    agent_id: "engenty.copilot",
    archived_at: null,
    created_at: "2026-05-17T00:00:00.000Z",
    created_by_user_id: userId,
    id: threadId,
    metadata: {},
    route_context: {},
    status: "idle",
    summary: null,
    tenant_id: tenantId,
    title: null,
    updated_at: "2026-05-17T00:00:00.000Z",
    space_id: null,
    visibility: "space",
    workspace_key: null,
  };
}

function makeMessage(): ThreadMessageRow {
  return {
    author_user_id: userId,
    created_at: "2026-05-17T00:00:01.000Z",
    id: messageId,
    parts: [{ type: "text", text: "Find Ada Lovelace" }],
    role: "user",
    thread_id: threadId,
    tenant_id: tenantId,
  };
}

function makeRunRouteHarness({
  assertNativeMemoryAvailable = vi.fn(async () => {}),
  conversation = false,
  getThread = vi.fn(async () => ({ thread: makeSession() })),
  streamGenerate = vi.fn(async () => ({ message: makeMessage(), text: "ok" })),
  getRunStore,
}: {
  assertNativeMemoryAvailable?: ReturnType<typeof vi.fn>;
  /** Enable the conversation-substrate branch (createRegistry + getStore). */
  conversation?: boolean;
  getRunStore?: () => unknown;
  getThread?: ReturnType<typeof vi.fn>;
  streamGenerate?: ReturnType<typeof vi.fn>;
} = {}) {
  const app = new Hono();
  registerThreadRunRoutes(app as never, {
    aiService: {
      threads: {
        assertNativeMemoryAvailable,
        getThread,
        resolveRunModelConfig: vi.fn(async () => ({
          agentBudgetCostMicros: null,
          modelConfig: {},
          modelId: "test-model",
        })),
        resolveRunWorkspaces: vi.fn(async () => ({})),
        streamGenerate,
      },
    } as never,
    scopeResolver,
    ...(getRunStore ? { getRunStore: getRunStore as never } : {}),
    ...(conversation
      ? {
          createRegistry: () => ({}) as never,
          // The attachment-history load calls `listMessagesOrdered`; a store
          // without it throws synchronously and 500s the route.
          getStore: () => ({ listMessagesOrdered: async () => [] }) as never,
        }
      : {}),
  });
  return { app, streamGenerate };
}

function makeRunInput(overrides: Record<string, unknown> = {}) {
  return {
    context: [],
    forwardedProps: {},
    messages: [{ content: "Find Ada Lovelace", id: "message-1", role: "user" }],
    runId,
    state: {},
    threadId,
    tools: [],
    ...overrides,
  };
}

function postRun(app: Hono, input: Record<string, unknown>) {
  return app.request(`http://localhost/ai/v1/threads/${threadId}/runs`, {
    body: JSON.stringify(input),
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

describe("apps/ai thread run routes", () => {
  it("rejects AG-UI run input for a different thread", async () => {
    const { app, streamGenerate } = makeRunRouteHarness();

    const res = await postRun(
      app,
      makeRunInput({ threadId: "00000000-0000-4000-8000-000000000099" })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "agent_threads.threadMismatch",
    });
    expect(streamGenerate).not.toHaveBeenCalled();
  });

  it("returns an explicit non-stream error when native memory is unavailable", async () => {
    const { app, streamGenerate } = makeRunRouteHarness({
      assertNativeMemoryAvailable: vi.fn(async () => {
        throw new AiSessionError(
          "agent_threads.nativeMemoryUnavailable",
          "Native Mastra memory requires an agent configured with a concrete memory instance",
          {
            agent_id: "engenty.copilot",
            thread_id: threadId,
          }
        );
      }),
    });

    const res = await postRun(app, makeRunInput());
    const raw = await res.text();

    expect(res.status).toBe(409);
    expect(res.headers.get("Content-Type")).not.toBe("text/event-stream");
    expect(JSON.parse(raw)).toEqual({
      agent_id: "engenty.copilot",
      error: "agent_threads.nativeMemoryUnavailable",
      thread_id: threadId,
    });
    expect(streamGenerate).not.toHaveBeenCalled();
  });

  it("records the chat run durably via the run store", async () => {
    const createRun = vi.fn(async () => ({}));
    const appendRunEvent = vi.fn(async () => {});
    const finishRun = vi.fn(async () => {});
    const runStore = {
      appendRunEvent,
      cancelRun: vi.fn(async () => {}),
      createRun,
      finishRun,
      getRun: vi.fn(async () => null),
      listRunEvents: vi.fn(async () => []),
    };
    const { app } = makeRunRouteHarness({
      conversation: true,
      getRunStore: () => runStore,
    });

    const res = await postRun(app, makeRunInput());
    expect(res.status).toBe(200);
    // The stub registry fails the executor before the SSE subscriber attaches,
    // so a full read would hang — wait on the store writes instead.
    await res.body?.cancel();

    await vi.waitFor(() => {
      expect(createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: "engenty.copilot",
          id: runId,
          tenantId,
          threadId,
        })
      );
      expect(appendRunEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "RUN_STARTED", runId, seq: 0 })
      );
      // A row left "running" makes every reload attach to a dead run.
      expect(finishRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId, status: "failed" })
      );
    });
  });

  // AG-UI `messages` is accumulated state: a conforming client re-sends the
  // original user turn on every resume, so a resume must not be rejected for it.
  it("accepts an artifact resume that carries accumulated user messages", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = makeRunRouteHarness({
      conversation: true,
      getThread: vi.fn(async () => ({
        thread: {
          ...makeSession(),
          metadata: {
            // No run_id: an artifact resume, not a parked one.
            ag_ui_open_interrupt: {
              artifact_id: "tool-approval|op_a",
              choices: [{ id: "approve_once", label: "Approve once" }],
              interrupt_id: "tool-approval|op_a",
              kind: "decision",
              title: "Approve op_a?",
              tool_call_id: "call-a",
            },
          },
        },
      })),
    });

    const res = await postRun(
      app,
      makeRunInput({
        messages: [
          { content: "Please run op_a for me", id: "message-1", role: "user" },
        ],
        resume: [
          {
            interruptId: "tool-approval|op_a",
            payload: { choice_id: "approve_once" },
            status: "resolved",
          },
        ],
      })
    );
    await res.body?.cancel();
    warn.mockRestore();

    expect(res.status).not.toBe(400);
  });

  describe("parked approval resume guards", () => {
    const suspendedRunId = "11111111-1111-4111-8111-000000000001";

    function makeParkedResumeHarness() {
      return makeRunRouteHarness({
        conversation: true,
        getThread: vi.fn(async () => ({
          thread: {
            ...makeSession(),
            metadata: {
              ag_ui_open_interrupt: {
                artifact_id: "tool-approval|op_a",
                choices: [{ id: "approve_once", label: "Approve once" }],
                interrupt_id: "tool-approval|op_a",
                kind: "decision",
                run_id: suspendedRunId,
                title: "Approve op_a?",
                tool_call_id: "call-a",
              },
            },
          },
        })),
      });
    }

    function postResume(
      app: Hono,
      {
        interruptId = "tool-approval|op_a",
        payload = { choice_id: "approve_once" },
      }: { interruptId?: string; payload?: unknown } = {}
    ) {
      return postRun(
        app,
        makeRunInput({
          messages: [],
          resume: [{ interruptId, payload, status: "resolved" }],
        })
      );
    }

    // A missing choice reads as "not approved" — an id-only payload must not
    // silently deny.
    it("accepts an id-only choice when it matches one the interrupt offered", async () => {
      auditToolApprovalDecision.mockClear();
      const { app } = makeParkedResumeHarness();
      const res = await postResume(app as Hono);
      expect(res.status).not.toBe(400);
      expect(auditToolApprovalDecision).toHaveBeenCalledWith(
        expect.objectContaining({ decision: "approve_once" })
      );
    });

    it("rejects an unknown choice id instead of silently denying", async () => {
      const { app } = makeParkedResumeHarness();
      const res = await postResume(app as Hono, {
        payload: { choice_id: "approve_everything" },
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        choice_id: "approve_everything",
        error: "agent_threads.unresolvedChoice",
      });
    });

    it("keeps a payload that names no choice a deny", async () => {
      auditToolApprovalDecision.mockClear();
      const { app } = makeParkedResumeHarness();
      const res = await postResume(app as Hono, {
        payload: { approved: false },
      });
      expect(res.status).not.toBe(400);
      expect(auditToolApprovalDecision).toHaveBeenCalledWith(
        expect.objectContaining({ decision: "deny" })
      );
    });

    it("rejects a resume that answers a different interrupt than the open one", async () => {
      const { app } = makeParkedResumeHarness();
      const res = await postResume(app as Hono, {
        interruptId: "tool-approval|op_STALE",
      });
      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toMatchObject({
        error: "agent_threads.interruptMismatch",
        open_interrupt_id: "tool-approval|op_a",
      });
    });

    it("rejects a duplicate answer while a resume is already in flight", async () => {
      const { app } = makeParkedResumeHarness();
      expect(claimResumeInFlight(suspendedRunId)).toBe(true);
      try {
        const res = await postResume(app as Hono);
        expect(res.status).toBe(409);
        await expect(res.json()).resolves.toMatchObject({
          error: "agent_threads.resumeInProgress",
        });
      } finally {
        releaseResumeInFlight(suspendedRunId);
      }
    });
  });
});
