import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppsAiThread } from "./apps-ai-transport.js";

vi.mock("@engenty/api-client", () => ({
  getCurrentAccessToken: vi.fn(async () => "test-token"),
}));

describe("apps/ai transport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends stable session keys and route context when creating sessions", async () => {
    const fetchMock = vi.fn(async (_href: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      return new Response(
        JSON.stringify({
          session: {
            agent_id: body.agent_id,
            archived_at: null,
            created_at: "2026-05-19T00:00:00.000Z",
            created_by_user_id: "user-1",
            id: "session-1",
            metadata: {},
            route_context: body.route_context,
            tenant_id: "tenant-1",
            title: body.title,
            updated_at: "2026-05-19T00:00:00.000Z",
          },
        }),
        { status: 201 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await createAppsAiThread({
      agentId: "knowledge-base.manager",
      routeContext: {
        moduleId: "knowledge-base",
        routeKey: "article",
      },
      serviceBaseUrl: "http://127.0.0.1:8790",
      stableSessionKey: " kb-article:123 ",
      title: null,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({
      agent_id: "knowledge-base.manager",
      route_context: {
        moduleId: "knowledge-base",
        routeKey: "article",
      },
      stable_session_key: "kb-article:123",
      title: null,
    });
  });
});
