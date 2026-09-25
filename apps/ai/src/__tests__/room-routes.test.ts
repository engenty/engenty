import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import { registerRoomRoutes } from "../api/room-routes.js";
import type { ThreadRow } from "../dal/threads/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const spaceId = "00000000-0000-4000-8000-000000000003";
const roomId = "00000000-0000-4000-8000-000000000004";

const scopeResolver = createStaticAiScopeResolver({ tenantId, userId });

function room(): ThreadRow {
  return {
    agent_id: "master",
    archived_at: null,
    created_at: "2026-09-07T00:00:00.000Z",
    created_by_user_id: userId,
    id: roomId,
    metadata: { agent_turns_since_human: 12, room_paused: true },
    route_context: {},
    space_id: spaceId,
    status: "idle",
    summary: null,
    tenant_id: tenantId,
    title: "Tic-tac-toe",
    updated_at: "2026-09-07T00:00:00.000Z",
    visibility: "space",
    workspace_key: null,
  };
}

const otherUserId = "00000000-0000-4000-8000-000000000005";

vi.mock("../ai/sessions/thread-access.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../ai/sessions/thread-access.js")>();
  return { ...actual, canEnterSpaceDefault: async () => true };
});

vi.mock("../ai/sessions/user-display-names.js", () => ({
  resolveUserDisplayNames: async () => new Map(),
}));

function harness() {
  const members = new Map<string, "host" | "member">([["master", "host"]]);
  const people = new Map<string, "owner" | "member">([[userId, "owner"]]);
  const store = {
    addAgentMember: vi.fn(async ({ agentId }: { agentId: string }) => {
      if (!members.has(agentId)) {
        members.set(agentId, "member");
      }
    }),
    appendMessage: vi.fn(async () => ({ message: {} })),
    addUserParticipant: vi.fn(async ({ userId: id }: { userId: string }) => {
      if (!people.has(id)) {
        people.set(id, "member");
      }
    }),
    getThread: vi.fn(async () => room()),
    listAgentMembers: vi.fn(async () =>
      [...members].map(([agent_id, role]) => ({ agent_id, role }))
    ),
    listDmsForUser: vi.fn(async () => []),
    listRoomsForSpace: vi.fn(async () => [
      {
        members: [...members].map(([agent_id, role]) => ({ agent_id, role })),
        thread: room(),
      },
    ]),
    listUserParticipants: vi.fn(async () =>
      [...people].map(([user_id, role]) => ({ role, user_id }))
    ),
    removeAgentMember: vi.fn(async ({ agentId }: { agentId: string }) => {
      members.delete(agentId);
    }),
    removeUserParticipant: vi.fn(async ({ userId: id }: { userId: string }) => {
      if (people.get(id) !== "owner") {
        people.delete(id);
      }
    }),
    setThreadVisibility: vi.fn(
      async ({ visibility }: { visibility: "private" | "space" }) => ({
        ...room(),
        visibility,
      })
    ),
    upsertThread: vi.fn(
      async (input: {
        id: string;
        routeContext: Record<string, unknown>;
        visibility?: "private" | "space";
      }) => ({
        thread: {
          ...room(),
          id: input.id,
          route_context: input.routeContext,
          visibility: input.visibility ?? "space",
        },
      })
    ),
  };
  const threads = {
    createThread: vi.fn(async () => ({ thread: room() })),
  };
  const app = new Hono();
  const agentScopes = new Map<string, "personal" | "shared">([
    ["master", "shared"],
    ["copilot", "personal"],
    ["engenty.copilot", "personal"],
  ]);
  registerRoomRoutes(app as never, {
    aiService: { threads } as never,
    getRegistry: () =>
      ({
        getAgentConfig: async (id: string) =>
          agentScopes.has(id)
            ? { agentScope: agentScopes.get(id), id }
            : undefined,
      }) as never,
    scopeResolver,
    store: store as never,
  });
  return { app, members, people, store };
}

const json = (body: unknown, method = "POST") =>
  new Request("http://x/ai/threads/rooms", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });

describe("room routes", () => {
  it("refuses a room of nobody or of seven; one agent is a room", async () => {
    const { app } = harness();
    expect(
      (
        await app.request(
          json({ agent_ids: [], space_id: spaceId, title: "x" })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await app.request(
          json({ agent_ids: ["master"], space_id: spaceId, title: "x" })
        )
      ).status
    ).toBe(201);
    expect(
      (
        await app.request(
          json({
            agent_ids: ["a", "b", "c", "d", "e", "f", "g"],
            space_id: spaceId,
            title: "x",
          })
        )
      ).status
    ).toBe(400);
  });

  it("adds and removes members but never the host", async () => {
    const { app, members } = harness();
    const added = await app.request(
      new Request(`http://x/ai/threads/${roomId}/agents`, {
        body: JSON.stringify({ agent_id: "tim" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(added.status).toBe(200);
    expect(members.get("tim")).toBe("member");

    const hostGone = await app.request(
      new Request(`http://x/ai/threads/${roomId}/agents/master`, {
        method: "DELETE",
      })
    );
    expect(hostGone.status).toBe(422);
    expect(members.has("master")).toBe(true);

    const removed = await app.request(
      new Request(`http://x/ai/threads/${roomId}/agents/tim`, {
        method: "DELETE",
      })
    );
    expect(removed.status).toBe(200);
    expect(members.has("tim")).toBe(false);
  });

  it("adds and removes people, but never the owner", async () => {
    const { app, people } = harness();
    const added = await app.request(
      new Request(`http://x/ai/threads/${roomId}/people`, {
        body: JSON.stringify({ user_id: otherUserId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(added.status).toBe(200);
    expect(people.get(otherUserId)).toBe("member");

    const ownerGone = await app.request(
      new Request(`http://x/ai/threads/${roomId}/people/${userId}`, {
        method: "DELETE",
      })
    );
    expect(ownerGone.status).toBe(422);
    expect(people.has(userId)).toBe(true);

    const removed = await app.request(
      new Request(`http://x/ai/threads/${roomId}/people/${otherUserId}`, {
        method: "DELETE",
      })
    );
    expect(removed.status).toBe(200);
    expect(people.has(otherUserId)).toBe(false);
  });

  it("lists only the caller's rooms and DMs", async () => {
    const { app, store } = harness();
    const res = await app.request(
      `http://x/ai/spaces/${spaceId}/conversations`
    );
    expect(res.status).toBe(200);
    expect(store.listRoomsForSpace).toHaveBeenCalledWith({
      spaceId,
      tenantId,
      viewerUserId: userId,
    });
    expect(store.listDmsForUser).toHaveBeenCalledWith({
      spaceId,
      tenantId,
      userId,
    });
    expect(store.listDmsForUser).toHaveBeenCalledWith({
      spaceId: null,
      tenantId,
      userId,
    });
  });

  it("opens a DM once: the same private row on every call", async () => {
    const { app, store } = harness();
    const open = () =>
      app.request(
        new Request("http://x/ai/threads/dm", {
          body: JSON.stringify({ agent_id: "master", space_id: spaceId }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      );
    store.getThread.mockResolvedValueOnce(null as never);
    const first = await open();
    expect(first.status).toBe(201);
    const created = (await first.json()) as {
      session: { id: string; visibility: string };
    };
    expect(created.session.visibility).toBe("private");

    store.getThread.mockResolvedValueOnce({
      ...room(),
      id: created.session.id,
      route_context: { dm: true },
      visibility: "private",
    } as never);
    const second = await open();
    expect(second.status).toBe(200);
    const again = (await second.json()) as {
      created: boolean;
      session: { id: string };
    };
    expect(again.created).toBe(false);
    expect(again.session.id).toBe(created.session.id);
  });

  it("a personal agent's DM is the river: tenant-wide, one per person, never in a Space", async () => {
    const { app, store } = harness();
    store.getThread.mockResolvedValueOnce(null as never);
    const river = await app.request(
      new Request("http://x/ai/threads/dm", {
        body: JSON.stringify({ agent_id: "copilot" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(river.status).toBe(201);
    expect(store.upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "copilot",
        routeContext: { dm: true },
        spaceId: null,
        visibility: "private",
      })
    );
    const placed = await app.request(
      new Request("http://x/ai/threads/dm", {
        body: JSON.stringify({ agent_id: "copilot", space_id: spaceId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(placed.status).toBe(400);
    expect(await placed.json()).toEqual({
      error: "agent_threads.personalDmHasNoSpace",
    });
  });

  it("the copilot's river opens with its welcome, once", async () => {
    const { app, store } = harness();
    const open = () =>
      app.request(
        new Request("http://x/ai/threads/dm", {
          body: JSON.stringify({ agent_id: "engenty.copilot" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      );
    store.getThread.mockResolvedValueOnce(null as never);
    expect((await open()).status).toBe(201);
    expect(store.appendMessage).toHaveBeenCalledTimes(1);
    expect(store.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        authorUserId: null,
        metadata: { source: "river-welcome" },
        role: "assistant",
      })
    );

    // The river exists now: opening it again adds nothing.
    expect((await open()).status).toBe(200);
    expect(store.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("a shared specialist's DM needs its Space; an unknown agent has none", async () => {
    const { app } = harness();
    const unplaced = await app.request(
      new Request("http://x/ai/threads/dm", {
        body: JSON.stringify({ agent_id: "master" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(unplaced.status).toBe(400);
    const unknown = await app.request(
      new Request("http://x/ai/threads/dm", {
        body: JSON.stringify({ agent_id: "nobody", space_id: spaceId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(unknown.status).toBe(404);
  });

  it("a person joins a space-visible room themselves, never a private one, a pair or a DM", async () => {
    const { app, store } = harness();
    const join = (id = roomId) =>
      app.request(
        new Request(`http://x/ai/threads/${id}/join`, { method: "POST" })
      );
    store.getThread.mockResolvedValueOnce({
      ...room(),
      route_context: { room: true },
    } as never);
    const ok = await join();
    expect(ok.status).toBe(200);
    expect(store.addUserParticipant).toHaveBeenCalledWith({
      tenantId,
      threadId: roomId,
      userId,
    });

    store.getThread.mockResolvedValueOnce({
      ...room(),
      route_context: { room: true },
      visibility: "private",
    } as never);
    expect((await join()).status).toBe(403);

    store.getThread.mockResolvedValueOnce({
      ...room(),
      route_context: { delegated: true, room: true },
    } as never);
    expect((await join()).status).toBe(422);

    store.getThread.mockResolvedValueOnce({
      ...room(),
      route_context: { dm: true },
    } as never);
    expect((await join()).status).toBe(422);

    store.getThread.mockResolvedValueOnce(room() as never);
    expect((await join()).status).toBe(422);
  });

  it("opens a room private when told private", async () => {
    const { app } = harness();
    const res = await app.request(
      json({
        agent_ids: ["master", "tim"],
        space_id: spaceId,
        title: "Private",
        visibility: "private",
      })
    );
    expect(res.status).toBe(201);
    expect(
      ((await res.json()) as { session: { visibility: string } }).session
        .visibility
    ).toBe("private");
  });
});
