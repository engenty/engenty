import { parseAgUiSseChunk } from "@engenty/ag-ui-bridge";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

// The audit call is the cleanest observation point for WHICH decision the route
// concluded: approve_once / approve_always / deny. Asserting on it is what makes
// the id-only-payload test meaningful — the pre-fix code also returned 200 here,
// it just silently recorded (and acted on) a deny.
const auditToolApprovalDecision = vi.fn();
vi.mock("../ai/sessions/tool-approval-audit.js", () => ({
  auditToolApprovalDecision: (...args: unknown[]) =>
    auditToolApprovalDecision(...args),
}));

import {
  finishParkedResume,
  parkSessionRun,
  takeParkedSessionRun,
} from "../ai/conversation/session-park.js";
import { AiSessionError } from "../ai/errors.js";
import type { AgUiDebugEventBus } from "../api/copilotkit-debug-events.js";
import { createStaticAiScopeResolver } from "../api/http.js";
import { registerThreadRoutes } from "../api/thread-routes.js";
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

function makeThreadRouteHarness(
  threads: Record<string, unknown>,
  onThreadPersisted = vi.fn(
    async (_params: {
      threadId: string;
      tenantId: string;
      userId: string;
    }) => {}
  )
) {
  const app = new Hono();
  registerThreadRoutes(app as never, {
    aiService: {
      threads,
    } as never,
    onThreadPersisted,
    scopeResolver,
  });
  return { app, onThreadPersisted };
}

function makeGenerateRouteHarness(
  generate = vi.fn(async () => ({
    message: makeMessage(),
    text: "ok",
  }))
) {
  return {
    ...makeThreadRouteHarness({ generate }),
    generate,
  };
}

function makeRunRouteHarness({
  assertNativeMemoryAvailable = vi.fn(async () => {}),
  conversation = false,
  debugEvents,
  getThread = vi.fn(async () => ({ thread: makeSession() })),
  onThreadPersisted = vi.fn(
    async (_params: {
      threadId: string;
      tenantId: string;
      userId: string;
    }) => {}
  ),
  streamGenerate = vi.fn(async (input) => {
    input.onTextStart?.("assistant-message-1");
    input.onTextDelta?.("ok");
    input.onTextEnd?.("assistant-message-1");
    return { message: makeMessage(), text: "ok" };
  }),
  getRunStore,
  store,
}: {
  assertNativeMemoryAvailable?: ReturnType<typeof vi.fn>;
  /** Enable the conversation-substrate branch (createRegistry + getStore). */
  conversation?: boolean;
  debugEvents?: AgUiDebugEventBus;
  getRunStore?: () => unknown;
  getThread?: ReturnType<typeof vi.fn>;
  onThreadPersisted?: (params: {
    threadId: string;
    tenantId: string;
    userId: string;
  }) => Promise<void>;
  streamGenerate?: ReturnType<typeof vi.fn>;
  /**
   * Conversation store the route writes through. Defaults to `{}` (the route's
   * metadata writes are best-effort and swallowed), so pass a real fake when the
   * assertion is about what got PERSISTED.
   */
  store?: unknown;
} = {}) {
  const app = new Hono();
  registerThreadRunRoutes(app as never, {
    debugEvents,
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
    onThreadPersisted,
    scopeResolver,
    ...(getRunStore ? { getRunStore: getRunStore as never } : {}),
    ...(conversation
      ? {
          createRegistry: () => ({}) as never,
          getStore: () => (store ?? {}) as never,
        }
      : {}),
  });
  return {
    app,
    assertNativeMemoryAvailable,
    onThreadPersisted,
    streamGenerate,
  };
}

async function readAgUiEvents(res: Response) {
  return parseAgUiSseChunk(await res.text());
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

describe("apps/ai session routes", () => {
  it("creates a server session and persists the first user message", async () => {
    const createThread = vi.fn(async () => ({ thread: makeSession() }));
    const appendMessage = vi.fn(async () => ({ message: makeMessage() }));
    const { app, onThreadPersisted } = makeThreadRouteHarness({
      appendMessage,
      createThread,
    });

    const createRes = await app.request("http://localhost/ai/threads", {
      body: JSON.stringify({
        agent_id: "engenty.copilot",
        stable_session_key: "chatbot:preview:abc",
        title: null,
      }),
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(createRes.status).toBe(201);
    expect(createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "engenty.copilot",
        sessionKey: "chatbot:preview:abc",
        scope: expect.objectContaining({ tenantId, userId }),
      })
    );

    const messageRes = await app.request(
      `http://localhost/ai/threads/${threadId}/messages`,
      {
        body: JSON.stringify({
          parts: [{ type: "text", text: "Find Ada Lovelace" }],
          role: "user",
        }),
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );

    expect(messageRes.status).toBe(201);
    expect(appendMessage).toHaveBeenCalledWith({
      authorUserId: undefined,
      parts: [{ type: "text", text: "Find Ada Lovelace" }],
      role: "user",
      scope: expect.objectContaining({ tenantId, userId }),
      threadId,
    });
    expect(onThreadPersisted).toHaveBeenCalledWith({
      threadId,
      tenantId,
      userId,
    });
  });

  it("forwards active_artifact_id on PATCH as activeArtifactId (multi-window artifact sync)", async () => {
    const updateThread = vi.fn(async () => ({ thread: makeSession() }));
    const { app } = makeThreadRouteHarness({ updateThread });

    const res = await app.request(`http://localhost/ai/threads/${threadId}`, {
      body: JSON.stringify({ active_artifact_id: "artifact-1" }),
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    expect(updateThread).toHaveBeenCalledWith(
      expect.objectContaining({
        activeArtifactId: "artifact-1",
        threadId,
        scope: expect.objectContaining({ tenantId, userId }),
      })
    );
  });

  it("forwards a null active_artifact_id (clearing) distinctly from omitting the field", async () => {
    const updateThread = vi.fn(async () => ({ thread: makeSession() }));
    const { app } = makeThreadRouteHarness({ updateThread });

    await app.request(`http://localhost/ai/threads/${threadId}`, {
      body: JSON.stringify({ active_artifact_id: null }),
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });
    expect(updateThread).toHaveBeenCalledWith(
      expect.objectContaining({ activeArtifactId: null })
    );

    updateThread.mockClear();
    await app.request(`http://localhost/ai/threads/${threadId}`, {
      body: JSON.stringify({ title: "Renamed" }),
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });
    expect(updateThread).not.toHaveBeenCalledWith(
      expect.objectContaining({ activeArtifactId: expect.anything() })
    );
  });

  it("defaults the generate route to native Mastra memory and the control plane", async () => {
    const { app, generate } = makeGenerateRouteHarness();

    const res = await app.request(
      `http://localhost/ai/threads/${threadId}/generate`,
      {
        headers: {
          Authorization: "Bearer token",
        },
        method: "POST",
      }
    );

    expect(res.status).toBe(200);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({ tenantId, userId }),
        threadId,
      })
    );
  });

  it("returns an explicit error when native memory is unavailable", async () => {
    const { app } = makeGenerateRouteHarness(
      vi.fn(async () => {
        throw new AiSessionError(
          "agent_threads.nativeMemoryUnavailable",
          "Native Mastra memory requires an agent configured with a concrete memory instance",
          {
            agent_id: "engenty.copilot",
            thread_id: threadId,
          }
        );
      })
    );

    const res = await app.request(
      `http://localhost/ai/threads/${threadId}/generate`,
      {
        headers: {
          Authorization: "Bearer token",
        },
        method: "POST",
      }
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      agent_id: "engenty.copilot",
      error: "agent_threads.nativeMemoryUnavailable",
      thread_id: threadId,
    });
  });

  it("rejects AG-UI run input for a different thread", async () => {
    const { app, streamGenerate } = makeRunRouteHarness();

    const res = await app.request(
      `http://localhost/ai/v1/threads/${threadId}/runs`,
      {
        body: JSON.stringify(
          makeRunInput({
            threadId: "00000000-0000-4000-8000-000000000099",
          })
        ),
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "agent_threads.threadMismatch",
    });
    expect(streamGenerate).not.toHaveBeenCalled();
  });

  it("returns an explicit non-stream error when native memory is unavailable", async () => {
    const streamGenerate = vi.fn(async () => ({
      message: makeMessage(),
      text: "ok",
    }));
    const { app } = makeRunRouteHarness({
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
      streamGenerate,
    });

    const res = await app.request(
      `http://localhost/ai/v1/threads/${threadId}/runs`,
      {
        body: JSON.stringify(makeRunInput()),
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );
    const raw = await res.text();

    expect(res.status).toBe(409);
    expect(res.headers.get("Content-Type")).not.toBe("text/event-stream");
    expect(JSON.parse(raw)).toEqual({
      agent_id: "engenty.copilot",
      error: "agent_threads.nativeMemoryUnavailable",
      thread_id: threadId,
    });
    expect(raw).not.toContain("RUN_STARTED");
    expect(streamGenerate).not.toHaveBeenCalled();
  });

  it("rejects resume runs that include new user messages", async () => {
    const { app, streamGenerate } = makeRunRouteHarness();

    const res = await app.request(
      `http://localhost/ai/v1/threads/${threadId}/runs`,
      {
        body: JSON.stringify(
          makeRunInput({
            messages: [
              { content: "New message", id: "message-2", role: "user" },
            ],
            resume: [{ interruptId: "int-1", status: "resolved" }],
          })
        ),
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "agent_threads.resumeWithMessages",
    });
    expect(streamGenerate).not.toHaveBeenCalled();
  });

  // Parked tool-approval resumes (native HITL). With parallel gated tool calls
  // the approvals chain one interrupt at a time; a stale or duplicate answer
  // must be rejected up front instead of being applied to whatever interrupt
  // happens to be open (or racing the live resume).
  // Chat runs were invisible to reload-recovery and other windows: the
  // conversation lane never wrote ai.agent_run / ai.agent_run_event (the
  // tracker was wired only into the headless + delegate lanes), so a reloaded
  // client listing session runs found NOTHING to reattach to even while the
  // run kept executing server-side.
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

    const res = await app.request(
      `http://localhost/ai/v1/threads/${threadId}/runs`,
      {
        body: JSON.stringify(makeRunInput()),
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );
    expect(res.status).toBe(200);
    // Don't drain the SSE response: the stub registry makes the executor fail
    // faster than the route's subscriber attaches, so no terminal event ever
    // reaches this response and a full read would hang. The tracker calls are
    // what this test is about — wait on those instead.
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
      // The run row is CLOSED even on failure — a row stuck "running" would
      // make every future reload try to attach to a dead run.
      expect(finishRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId, status: "failed" })
      );
    });
  });

  describe("parked approval resume guards", () => {
    const suspendedRunId = "11111111-1111-4111-8111-000000000001";

    function makeParkedApprovalSession(): ThreadRow {
      return {
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
      };
    }

    function makeParkedResumeHarness() {
      return makeRunRouteHarness({
        conversation: true,
        getThread: vi.fn(async () => ({
          thread: makeParkedApprovalSession(),
        })),
      });
    }

    /** Answer the OPEN interrupt with an arbitrary resume payload. */
    function postResumeWithPayload(app: Hono, payload: unknown) {
      return app.request(`http://localhost/ai/v1/threads/${threadId}/runs`, {
        body: JSON.stringify(
          makeRunInput({
            messages: [],
            resume: [
              {
                interruptId: "tool-approval|op_a",
                payload,
                status: "resolved",
              },
            ],
          })
        ),
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    }

    function postResume(app: Hono, interruptId: string) {
      return app.request(`http://localhost/ai/v1/threads/${threadId}/runs`, {
        body: JSON.stringify(
          makeRunInput({
            messages: [],
            resume: [
              {
                interruptId,
                payload: { choice_id: "approve_once" },
                status: "resolved",
              },
            ],
          })
        ),
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    }

    // An id-only payload used to resolve to "no choice", which the approval
    // branches read as "not approved" — a SILENT deny that looked exactly like
    // the user pressing Deny. The id is now matched against the interrupt's own
    // choices, and an id that matches nothing is rejected rather than guessed.
    it("accepts an id-only choice when it matches one the interrupt offered", async () => {
      auditToolApprovalDecision.mockClear();
      const { app } = makeParkedResumeHarness();
      const res = await postResumeWithPayload(app as Hono, {
        choice_id: "approve_once",
      });
      expect(res.status).not.toBe(400);
      // Pre-fix this recorded "deny" — a 200 alone would not have caught it.
      expect(auditToolApprovalDecision).toHaveBeenCalledWith(
        expect.objectContaining({ decision: "approve_once" })
      );
    });

    it("rejects an unknown choice id instead of silently denying", async () => {
      const { app } = makeParkedResumeHarness();
      const res = await postResumeWithPayload(app as Hono, {
        choice_id: "approve_everything",
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        choice_id: "approve_everything",
        error: "agent_threads.unresolvedChoice",
      });
    });

    it("leaves non-choice resume payloads alone", async () => {
      auditToolApprovalDecision.mockClear();
      const { app } = makeParkedResumeHarness();
      const res = await postResumeWithPayload(app as Hono, { approved: false });
      expect(res.status).not.toBe(400);
      // Still a deny — only a payload that NAMES a choice can be unresolvable.
      expect(auditToolApprovalDecision).toHaveBeenCalledWith(
        expect.objectContaining({ decision: "deny" })
      );
    });

    it("rejects a resume that answers a different interrupt than the open one", async () => {
      const { app } = makeParkedResumeHarness();
      const res = await postResume(app as Hono, "tool-approval|op_STALE");
      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toMatchObject({
        error: "agent_threads.interruptMismatch",
        open_interrupt_id: "tool-approval|op_a",
      });
    });

    // Second half of the restart chain (the first half — thread load NOT
    // clearing the interrupt — is covered in reconcile-orphaned-interrupt.test).
    // With the park empty, dispatch must still enter the resume lane so the
    // snapshot fallback gets its chance; the pre-fix symptom was the route
    // matching no branch at all and answering "no runtime matched this run".
    it("dispatches to the resume lane when the park is gone (post-restart)", async () => {
      const { app } = makeParkedResumeHarness();
      const res = await postResume(app as Hono, "tool-approval|op_a");
      const body = await res.text();
      expect(body).not.toContain("no runtime matched this run");
      // Reached resumeConversationRun: it reports the snapshot lane's verdict
      // rather than the route's fell-through-everything error.
      expect(body).toContain("no resumable snapshot");
    });

    it("rejects a duplicate answer while a resume is already in flight", async () => {
      const { app } = makeParkedResumeHarness();
      // Simulate the live resume having taken the parked run.
      parkSessionRun(suspendedRunId, {
        controller: { destroy: vi.fn(async () => {}) } as never,
        mergedDefinitions: [],
        session: { suspensions: { has: () => true } } as never,
        threadId,
      });
      expect(takeParkedSessionRun(suspendedRunId)).toBeTruthy();
      try {
        const res = await postResume(app as Hono, "tool-approval|op_a");
        expect(res.status).toBe(409);
        await expect(res.json()).resolves.toMatchObject({
          error: "agent_threads.resumeInProgress",
        });
      } finally {
        finishParkedResume(suspendedRunId);
      }
    });

    // An ARTIFACT approval interrupt: no `run_id`, because interactive chat's
    // start run gates under approvalPolicy "artifact" (a gated op returns the
    // Approve/Deny card as a tool result instead of suspending). This is the
    // branch real chats take for the FIRST approval of a turn.
    function makeArtifactApprovalSession(): ThreadRow {
      return {
        ...makeSession(),
        metadata: {
          ag_ui_open_interrupt: {
            artifact_id: "tool-approval|op_a",
            choices: [
              { id: "approve_always", label: "Approve always" },
              { id: "approve_once", label: "Approve once" },
            ],
            interrupt_id: "tool-approval|op_a",
            kind: "decision",
            title: "Approve op_a?",
            tool_call_id: "call-a",
          },
        },
      };
    }

    function makeArtifactApprovalHarness() {
      const merges: Record<string, unknown>[] = [];
      const store = {
        listMessagesOrdered: vi.fn(async () => []),
        mergeThreadMetadataForUser: vi.fn(
          async (params: Record<string, unknown>) => {
            merges.push(params);
            return { thread: makeArtifactApprovalSession() };
          }
        ),
        updateMessageParts: vi.fn(async () => ({ message: makeMessage() })),
      };
      const { app } = makeRunRouteHarness({
        conversation: true,
        getThread: vi.fn(async () => ({
          thread: makeArtifactApprovalSession(),
        })),
        store,
      });
      return { app, merges };
    }

    // Regression: "approve always" was folded into the in-memory metadata handed
    // to the re-run, but NEVER written to the thread. It therefore lasted only
    // for that request's runs — the next turn re-prompted the same operation, so
    // "always" silently behaved like "once" (observed live: two approve_always
    // audits for one operation, and `ai.thread.metadata` with no grants key).
    // The parked branch has always persisted; this one did not.
    it("persists an approve_always grant, and it survives clearing the interrupt", async () => {
      auditToolApprovalDecision.mockClear();
      const { app, merges } = makeArtifactApprovalHarness();

      const res = await app.request(
        `http://localhost/ai/v1/threads/${threadId}/runs`,
        {
          body: JSON.stringify(
            makeRunInput({
              messages: [],
              resume: [
                {
                  interruptId: "tool-approval|op_a",
                  payload: { choice_id: "approve_always" },
                  status: "resolved",
                },
              ],
            })
          ),
          headers: {
            Authorization: "Bearer token",
            "Content-Type": "application/json",
          },
          method: "POST",
        }
      );

      expect(res.status).not.toBe(400);
      expect(auditToolApprovalDecision).toHaveBeenCalledWith(
        expect.objectContaining({ decision: "approve_always" })
      );

      const granting = merges.find(
        (merge) =>
          (merge.appendSets as Record<string, string[]> | undefined)
            ?.engenty_tool_approval_grants
      );
      expect(granting).toBeDefined();
      expect(
        (granting?.appendSets as Record<string, string[]>)
          .engenty_tool_approval_grants
      ).toEqual(["op_a"]);
      // Same statement drops the answered interrupt — the point of the fix is
      // that the grant is not lost to that clear. (The RPC applies
      // append-then-remove against the current row.)
      expect(granting?.removeKeys).toContain("ag_ui_open_interrupt");
    });

    it("records a DENY without granting anything", async () => {
      auditToolApprovalDecision.mockClear();
      const { app, merges } = makeArtifactApprovalHarness();

      await app.request(`http://localhost/ai/v1/threads/${threadId}/runs`, {
        body: JSON.stringify(
          makeRunInput({
            messages: [],
            resume: [
              {
                interruptId: "tool-approval|op_a",
                payload: {},
                status: "cancelled",
              },
            ],
          })
        ),
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      expect(auditToolApprovalDecision).toHaveBeenCalledWith(
        expect.objectContaining({ decision: "deny" })
      );
      expect(merges.some((merge) => merge.appendSets !== undefined)).toBe(
        false
      );
    });
  });
});
