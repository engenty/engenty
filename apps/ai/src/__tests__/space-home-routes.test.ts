import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSpaceEntryCacheForTests } from "../ai/sessions/thread-access.js";
import { createStaticAiScopeResolver } from "../api/http.js";
import { registerSpaceHomeRoutes } from "../api/space-home-routes.js";
import type { ThreadStore } from "../dal/threads/index.js";
import type { ThreadRow } from "../dal/threads/types.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const spaceId = "00000000-0000-4000-8000-000000000003";
const otherSpaceId = "00000000-0000-4000-8000-000000000009";
const ownThreadId = "00000000-0000-4000-8000-000000000004";
const foreignThreadId = "00000000-0000-4000-8000-000000000005";

function threadRow(id: string, threadSpaceId: string): ThreadRow {
  return {
    agent_id: "master",
    archived_at: null,
    created_at: "2026-09-09T00:00:00.000Z",
    created_by_user_id: userId,
    id,
    metadata: {},
    route_context: {},
    space_id: threadSpaceId,
    status: "idle",
    summary: null,
    tenant_id: tenantId,
    title: id,
    updated_at: "2026-09-09T07:00:00.000Z",
    visibility: "space",
    workspace_key: null,
  } as ThreadRow;
}

function homeApp() {
  const store = {
    listAppReleaseMarkersForThreads: async () => [],
    listDmsForUser: async () => [],
    listLatestMessagesForThreads: async () => new Map(),
    listRoomsForSpace: async () => [],
    listThreadsForUser: async () => [
      threadRow(ownThreadId, spaceId),
      threadRow(foreignThreadId, otherSpaceId),
    ],
    listUnattendedThreadsForSpace: async () => [],
  } as unknown as ThreadStore;
  const app = new Hono();
  registerSpaceHomeRoutes(app as never, {
    getRunStore: () => null,
    scopeResolver: createStaticAiScopeResolver({ tenantId, userId }),
    store,
  });
  return app;
}

/** Core answers the Space-surface read the entry check makes. */
function coreAllowsEntry(allowed: boolean) {
  vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://core.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      allowed
        ? Response.json({ ok: true, data: { modules: [] } })
        : Response.json({ error: "forbidden" }, { status: 403 })
    )
  );
}

function getHome() {
  return homeApp().request(`/ai/spaces/${spaceId}/home`, {
    headers: { Authorization: "Bearer user-token" },
  });
}

describe("GET /ai/spaces/:spaceId/home", () => {
  afterEach(() => {
    // Entry grants are cached for 30 s; each case sets its own answer.
    clearSpaceEntryCacheForTests();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("shows only conversations of the requested Space", async () => {
    coreAllowsEntry(true);

    const res = await getHome();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { threads: { thread_id: string }[] };
    expect(body.threads.map((row) => row.thread_id)).toEqual([ownThreadId]);
  });

  it("refuses a caller who cannot enter the Space", async () => {
    coreAllowsEntry(false);

    const res = await getHome();

    expect(res.status).toBe(403);
  });
});
