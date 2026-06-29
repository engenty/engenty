import { parseAgUiSseChunk } from "@engenty/ag-ui-bridge";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { AiSessionError } from "../ai/errors.js";
import { registerAgentSessionRunRoutes } from "../api/agent-session-runs-routes.js";
import { registerAgentSessionRoutes } from "../api/agent-sessions-routes.js";
import type { AgUiDebugEventBus } from "../api/copilotkit-debug-events.js";
import { createStaticAiScopeResolver } from "../api/http.js";
import type {
  AgentSessionMessageRow,
  AgentSessionRow,
} from "../dal/agent-sessions/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const messageId = "00000000-0000-4000-8000-000000000004";
const runId = "run-1";

const scopeResolver = createStaticAiScopeResolver({
  tenantId,
  userId,
});

function makeSession(): AgentSessionRow {
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

function makeMessage(): AgentSessionMessageRow {
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

function makeSessionRouteHarness(
  sessions: Record<string, unknown>,
  onSessionPersisted = vi.fn(async () => {})
) {
  const app = new Hono();
  registerAgentSessionRoutes(app as never, {
    aiService: {
      sessions,
    } as never,
    onSessionPersisted,
    scopeResolver,
  });
  return { app, onSessionPersisted };
}

function makeGenerateRouteHarness(
  generate = vi.fn(async () => ({
    message: makeMessage(),
    text: "ok",
  }))
) {
  return {
    ...makeSessionRouteHarness({ generate }),
    generate,
  };
}

function makeRunRouteHarness({
  assertNativeMemoryAvailable = vi.fn(async () => {}),
  debugEvents,
  getSession = vi.fn(async () => ({ session: makeSession() })),
  onSessionPersisted = vi.fn(async () => {}),
  streamGenerate = vi.fn(async (input) => {
    input.onTextStart?.("assistant-message-1");
    input.onTextDelta?.("ok");
    input.onTextEnd?.("assistant-message-1");
    return { message: makeMessage(), text: "ok" };
  }),
}: {
  assertNativeMemoryAvailable?: ReturnType<typeof vi.fn>;
  debugEvents?: AgUiDebugEventBus;
  getSession?: ReturnType<typeof vi.fn>;
  onSessionPersisted?: ReturnType<typeof vi.fn>;
  streamGenerate?: ReturnType<typeof vi.fn>;
} = {}) {
  const app = new Hono();
  registerAgentSessionRunRoutes(app as never, {
    debugEvents,
    aiService: {
      sessions: {
        assertNativeMemoryAvailable,
        getSession,
        streamGenerate,
      },
    } as never,
    onSessionPersisted,
    scopeResolver,
  });
  return {
    app,
    assertNativeMemoryAvailable,
    onSessionPersisted,
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
    const createSession = vi.fn(async () => ({ session: makeSession() }));
    const appendMessage = vi.fn(async () => ({ message: makeMessage() }));
    const { app, onSessionPersisted } = makeSessionRouteHarness({
      appendMessage,
      createSession,
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
    expect(createSession).toHaveBeenCalledWith(
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
    expect(onSessionPersisted).toHaveBeenCalledWith({
      threadId,
      tenantId,
      userId,
    });
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
});
