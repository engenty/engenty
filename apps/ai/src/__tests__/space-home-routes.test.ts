import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import { registerSpaceHomeRoutes } from "../api/space-home-routes.js";
import type { AgentRunStore } from "../dal/threads/agent-run-store.js";
import type { ThreadStore } from "../dal/threads/index.js";
import type { ThreadRow } from "../dal/threads/types.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const spaceId = "00000000-0000-4000-8000-000000000003";
const roomId = "00000000-0000-4000-8000-000000000004";
const deskId = "00000000-0000-4000-8000-000000000005";
const routineId = "00000000-0000-4000-8000-000000000006";

const scopeResolver = createStaticAiScopeResolver({ tenantId, userId });

vi.mock("../ai/sessions/thread-access.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../ai/sessions/thread-access.js")>();
  return { ...actual, canEnterSpaceDefault: async () => true };
});

function threadRow(overrides: Partial<ThreadRow>): ThreadRow {
  return {
    agent_id: "master",
    archived_at: null,
    created_at: "2026-09-09T00:00:00.000Z",
    created_by_user_id: userId,
    id: deskId,
    metadata: {},
    route_context: {},
    space_id: spaceId,
    status: "idle",
    summary: null,
    tenant_id: tenantId,
    title: "Game Master",
    updated_at: "2026-09-09T07:00:00.000Z",
    visibility: "space",
    workspace_key: null,
    ...overrides,
  } as ThreadRow;
}

function harness() {
  const store = {
    listAppReleaseMarkersForThreads: vi.fn(async () => []),
    listDmsForUser: vi.fn(async () => []),
    listLatestMessagesForThreads: vi.fn(
      async () =>
        new Map([
          [
            deskId,
            {
              created_at: "2026-09-09T07:00:00.000Z",
              parts: [{ text: "Board 0.4 ist   gebaut.", type: "text" }],
              role: "assistant",
            },
          ],
        ])
    ),
    listRoomsForSpace: vi.fn(async () => [
      {
        members: [{ agent_id: "tim", role: "host" as const }],
        thread: threadRow({
          id: roomId,
          metadata: { agent_turns_since_human: 12, room_paused: true },
          route_context: { room: true },
          title: "Gaming Room",
        }),
      },
    ]),
    listThreadsForUser: vi.fn(async () => [threadRow({})]),
    listUnattendedThreadsForSpace: vi.fn(async () => [
      threadRow({
        agent_id: "coder",
        created_by_user_id: null,
        id: routineId,
        title: "Nightly board test",
      }),
    ]),
  } as unknown as ThreadStore;

  const runStore = {
    listRunsForThreads: vi.fn(async () => [
      {
        agent_id: "coder",
        finished_at: null,
        id: "run-1",
        metadata: {},
        started_at: "2026-09-09T07:55:00.000Z",
        status: "running",
        thread_id: routineId,
        trigger: "cron",
      },
    ]),
  } as unknown as AgentRunStore;

  const app = new Hono();
  registerSpaceHomeRoutes(app as never, {
    getRunStore: () => runStore,
    scopeResolver,
    store,
  });
  return { app, runStore, store };
}

describe("GET /ai/spaces/:spaceId/home", () => {
  it("answers with one state per conversation, kinds included", async () => {
    const { app } = harness();
    const res = await app.request(`/ai/spaces/${spaceId}/home`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cursor: string;
      threads: {
        agent_turns: number;
        kind: string;
        state: string;
        thread_id: string;
      }[];
    };
    expect(body.cursor).toMatch(/^\d{4}-/);
    const byId = new Map(body.threads.map((row) => [row.thread_id, row]));
    expect(byId.get(deskId)).toMatchObject({ kind: "desk", state: "quiet" });
    expect(
      (byId.get(deskId) as unknown as { last_message: { excerpt: string } })
        .last_message.excerpt
    ).toBe("Board 0.4 ist gebaut.");
    expect(byId.get(roomId)).toMatchObject({
      agent_turns: 12,
      kind: "room",
      state: "paused",
    });
    expect(byId.get(routineId)).toMatchObject({
      kind: "desk",
      state: "running",
    });
  });

  it("asks for runs once, for every thread of the Space", async () => {
    const { app, runStore } = harness();
    await app.request(`/ai/spaces/${spaceId}/home`);
    expect(runStore.listRunsForThreads).toHaveBeenCalledTimes(1);
    const call = vi.mocked(runStore.listRunsForThreads).mock.calls[0]?.[0];
    expect(call?.threadIds).toEqual(
      expect.arrayContaining([deskId, roomId, routineId])
    );
  });

  it("passes the caller's cursor through as the run window", async () => {
    const { app, runStore } = harness();
    await app.request(
      `/ai/spaces/${spaceId}/home?since=2026-09-09T06:00:00.000Z`
    );
    const call = vi.mocked(runStore.listRunsForThreads).mock.calls[0]?.[0];
    expect(call?.since).toBe("2026-09-09T06:00:00.000Z");
  });

  it("rejects a space id that is not a uuid", async () => {
    const { app } = harness();
    const res = await app.request("/ai/spaces/not-a-uuid/home");
    expect(res.status).toBe(400);
  });
});
