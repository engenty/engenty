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
  claimResumeInFlight,
  releaseResumeInFlight,
} from "../ai/conversation/resume-claims.js";
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
          // `listMessagesOrdered` is not optional: the attachment-history load
          // calls it and only catches a REJECTED promise, so a store missing
          // the method throws synchronously and 500s the route. The bare `{}`
          // default therefore has to carry it.
          getStore: () =>
            (store ?? { listMessagesOrdered: async () => [] }) as never,
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

  it("lists threads for one space_id and does not return another Space's history", async () => {
    const spaceA = "019fe8ec-0000-4000-8000-00000000000a";
    const spaceB = "019fe8ec-0000-4000-8000-00000000000b";
    const listThreads = vi.fn(async (input: { spaceId?: string }) => {
      const threads = [
        { ...makeSession(), id: "thread-a", space_id: spaceA },
        { ...makeSession(), id: "thread-b", space_id: spaceB },
      ];
      return {
        threads: input.spaceId
          ? threads.filter((thread) => thread.space_id === input.spaceId)
          : threads,
      };
    });
    const { app } = makeThreadRouteHarness({ listThreads });

    const res = await app.request(
      `http://localhost/ai/threads?space_id=${spaceA}`,
      {
        headers: { Authorization: "Bearer token" },
      }
    );

    expect(res.status).toBe(200);
    expect(listThreads).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: spaceA })
    );
    const body = (await res.json()) as {
      sessions: Array<{ id: string; space_id: string | null }>;
    };
    expect(body.sessions.map((session) => session.id)).toEqual(["thread-a"]);
    expect(body.sessions.some((session) => session.space_id === spaceB)).toBe(
      false
    );
  });

  it("store list for a Space is keyed by space_id, not tenant-wide", () => {
    // Mirrors thread-store.listThreadsForUser: a present spaceId is
    // `.eq("space_id", spaceId)` and must not include another Space's rows
    // or pre-space nulls. The live query filter is in
    // thread-store.space.test.ts — this keeps the route contract pinned here.
    const spaceA = "019fe8ec-0000-4000-8000-00000000000a";
    const listed = [
      { id: "thread-a", space_id: spaceA },
      { id: "thread-b", space_id: "019fe8ec-0000-0000-0000-00000000000b" },
      { id: "thread-legacy", space_id: null },
    ];
    const forSpace = listed.filter((row) => row.space_id === spaceA);
    expect(forSpace.map((row) => row.id)).toEqual(["thread-a"]);
    expect(forSpace.some((row) => row.space_id !== spaceA)).toBe(false);
  });

  it("forwards route_context.space_id on create so the store can pin the thread", async () => {
    const spaceA = "019fe8ec-0000-4000-8000-00000000000a";
    const createThread = vi.fn(async () => ({
      thread: { ...makeSession(), space_id: spaceA },
    }));
    const { app } = makeThreadRouteHarness({ createThread });

    const res = await app.request("http://localhost/ai/threads", {
      body: JSON.stringify({
        agent_id: "engenty.copilot",
        route_context: { space_id: spaceA, pathname: "/s/company" },
      }),
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(res.status).toBe(201);
    expect(createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        routeContext: expect.objectContaining({ space_id: spaceA }),
      })
    );
    const body = (await res.json()) as { session: { space_id: string | null } };
    expect(body.session.space_id).toBe(spaceA);
  });

  it("does not attach a client-supplied top-level space_id that is not in the schema", async () => {
    const spaceB = "019fe8ec-0000-4000-8000-00000000000b";
    const createThread = vi.fn(async () => ({ thread: makeSession() }));
    const { app } = makeThreadRouteHarness({ createThread });

    const res = await app.request("http://localhost/ai/threads", {
      body: JSON.stringify({
        agent_id: "engenty.copilot",
        space_id: spaceB,
      }),
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(res.status).toBe(201);
    expect(createThread).toHaveBeenCalledWith(
      expect.not.objectContaining({ spaceId: spaceB })
    );
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

  // `messages` is ACCUMULATED agent
  // state in AG-UI, so a conforming client re-sends the original user turn on
  // every resume. Rejecting them would 400 (`agent_threads.resumeWithMessages`) and no
  // stock AG-UI client could resume against us at all; it only worked because our
  // own client trimmed the array. The answer lives in `resume`, so the messages
  // are ignored rather than rejected.
  it("accepts a resume run that carries accumulated user messages", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = makeRunRouteHarness();

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

    expect(res.status).not.toBe(400);
    // Not silent: if a genuinely ambiguous case ever appears (a user typing while
    // a run is suspended), this is the evidence to design a real check on.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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

  // The ARTIFACT resume path. A
  // parked resume reads no messages at all, so dropping the 400 could not affect
  // it. This path is the one that does read them: an interrupt with NO run_id
  // (voice, and headless runs that cannot suspend — chat gates with a native
  // suspend and never takes this path)
  // re-runs through startConversationRun. Everything it derives from `messages`
  // must ignore them on a resume — the prompt comes from the resume payload, and
  // there is no new user turn to echo, size effort against, or attach files from.
  describe("artifact resume ignores accumulated messages", () => {
    function makeArtifactApprovalSession(): ThreadRow {
      return {
        ...makeSession(),
        metadata: {
          ag_ui_open_interrupt: {
            artifact_id: "tool-approval|op_a",
            choices: [{ id: "approve_once", label: "Approve once" }],
            interrupt_id: "tool-approval|op_a",
            kind: "decision",
            // No run_id — this is what makes it an ARTIFACT resume rather than a
            // parked one.
            title: "Approve op_a?",
            tool_call_id: "call-a",
          },
        },
      };
    }

    async function postArtifactResume() {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      // The echo rides the run-event tracker, so THIS is where it becomes
      // observable — the SSE body is not, because the stub registry fails the
      // executor before the route's subscriber attaches.
      const appendRunEvent = vi.fn(async () => undefined);
      const runStore = {
        appendRunEvent,
        cancelRun: vi.fn(async () => {}),
        createRun: vi.fn(async () => {}),
        finishRun: vi.fn(async () => {}),
        getRun: vi.fn(async () => null),
        listRunEvents: vi.fn(async () => []),
      };
      const harness = makeRunRouteHarness({
        conversation: true,
        getRunStore: () => runStore,
        getThread: vi.fn(async () => ({
          thread: makeArtifactApprovalSession(),
        })),
      });
      const res = await harness.app.request(
        `http://localhost/ai/v1/threads/${threadId}/runs`,
        {
          body: JSON.stringify(
            makeRunInput({
              // What a stock AG-UI client sends: the turn that started all this,
              // still in its accumulated state.
              messages: [
                {
                  content: "Please run op_a for me",
                  id: "message-1",
                  role: "user",
                },
              ],
              resume: [
                {
                  interruptId: "tool-approval|op_a",
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
        }
      );
      await res.body?.cancel();
      warn.mockRestore();
      return { appendRunEvent, res };
    }

    it("does not reject the resume", async () => {
      const { res } = await postArtifactResume();
      expect(res.status).not.toBe(400);
    });

    it("does not re-echo the original user turn", async () => {
      // The echo exists so OTHER windows can render a NEW user bubble. Replaying
      // the original turn's id on a resume re-emits a message every attached
      // window already shows — and a spec-compliant client APPENDS it to the copy
      // it already holds.
      const { appendRunEvent } = await postArtifactResume();
      // Wait for the run to actually start, or "no echo" is vacuously true.
      await vi.waitFor(() => {
        expect(appendRunEvent).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: "RUN_STARTED" })
        );
      });
      expect(appendRunEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "TEXT_MESSAGE_START" })
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

    // An id-only payload must not resolve to "no choice", which the approval
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
    // Dispatch must enter the resume lane so the
    // snapshot fallback gets its chance; the pre-fix symptom was the route
    // matching no branch at all and answering "no runtime matched this run".
    it("dispatches to the resume lane, which is now the only one", async () => {
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
      // Simulate a resume already running for this suspension.
      expect(claimResumeInFlight(suspendedRunId)).toBe(true);
      try {
        const res = await postResume(app as Hono, "tool-approval|op_a");
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
