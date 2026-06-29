import { afterEach, describe, expect, it, vi } from "vitest";
import { listRegistryAgents } from "./agent-registry-client.js";
import {
  createAgentSession,
  updateAgentSession,
} from "./agent-sessions-client.js";

vi.mock("@engenty/api-client", () => ({
  getCurrentAccessToken: vi.fn(async () => "test-token"),
}));

describe("agent session clients", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates sessions through apps/ai before the first message", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            session: {
              agent_id: "engenty.copilot",
              archived_at: null,
              created_at: "2026-05-17T00:00:00.000Z",
              created_by_user_id: "user-1",
              id: "session-1",
              metadata: {},
              tenant_id: "tenant-1",
              title: null,
              updated_at: "2026-05-17T00:00:00.000Z",
            },
          }),
          { status: 201 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = await createAgentSession({
      agentId: "engenty.copilot",
      serviceBaseUrl: "https://ai.engenty.localhost/",
      tenantId: "tenant-1",
      title: null,
      userId: "user-1",
    });

    expect(session.id).toBe("session-1");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.engenty.localhost/ai/threads");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      agent_id: "engenty.copilot",
      title: null,
    });
  });

  it("lists dynamic registry agents from apps/ai", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            agents: [
              {
                id: "engenty.copilot",
                instructions: "Say hello.",
                model: "openai/gpt-5-mini",
                name: "Hello agent",
                skillIds: [],
                toolIds: [],
              },
            ],
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const agents = await listRegistryAgents({
      serviceBaseUrl: "https://ai.engenty.localhost/",
    });

    expect(agents).toHaveLength(1);
    expect(agents[0]?.id).toBe("engenty.copilot");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.engenty.localhost/ai/registry/agents");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token",
    });
  });

  it("patches a session agent type", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            session: {
              agent_id: "knowledge-base.manager",
              archived_at: null,
              created_at: "2026-05-17T00:00:00.000Z",
              created_by_user_id: "user-1",
              id: "session-1",
              metadata: {},
              tenant_id: "tenant-1",
              title: null,
              updated_at: "2026-05-17T00:00:00.000Z",
            },
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = await updateAgentSession({
      agentId: "knowledge-base.manager",
      serviceBaseUrl: "https://ai.engenty.localhost/",
      threadId: "session-1",
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(session.agent_id).toBe("knowledge-base.manager");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.engenty.localhost/ai/threads/session-1");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      agent_id: "knowledge-base.manager",
    });
  });
});
