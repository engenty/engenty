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
  resolveUserDisplayNames: async (ids: readonly string[]) =>
    new Map(ids.map((id) => [id, id === userId ? "Matthias" : "Anna"])),
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
    listParticipantThreadIds: vi.fn(async () => []),
    listRoomsForSpace: vi.fn(async () => [
      {
        members: [...members].map(([agent_id, role]) => ({ agent_id, role })),
        thread: room(),
      },
    ]),
    listSpaceRoomsDirectory: vi.fn(async () => [
      {
        joined: false,
        members: [...members].map(([agent_id, role]) => ({ agent_id, role })),
        thread: room(),
      },
    ]),
    listUserParticipants: vi.fn(async () =>
      [...people].map(([user_id, role]) => ({ role, user_id }))
    ),
    mergeThreadMetadataForUser: vi.fn(
      async ({ patch }: { patch?: Record<string, unknown> }) => ({
        thread: { ...room(), metadata: patch ?? {} },
      })
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
    getThread: vi.fn(async () => room()),
    updateThread: vi.fn(async ({ title }: { title: string }) => ({
      thread: { ...room(), title },
    })),
  };
  const app = new Hono();
  const agentScopes = new Map<string, "personal" | "shared">([
    ["master", "shared"],
    ["copilot", "personal"],
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
  return { app, members, people, store, threads };
}

const json = (body: unknown, method = "POST") =>
  new Request("http://x/ai/threads/rooms", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });

describe("room routes", () => {
  it("creates a room hosted by the first agent with the rest as members", async () => {
    const { app, store, threads } = harness();
    const res = await app.request(
      json({
        agent_ids: ["master", "tim", "tom"],
        space_id: spaceId,
        title: "Game",
      })
    );
    expect(res.status).toBe(201);
    expect(threads.createThread).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "master", spaceId, title: "Game" })
    );
    expect(store.addAgentMember).toHaveBeenCalledTimes(2);
    const body = (await res.json()) as { members: { agent_id: string }[] };
    expect(body.members.map((m) => m.agent_id)).toEqual([
      "master",
      "tim",
      "tom",
    ]);
  });

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

  it("a purpose rides the create and is merged owner-keyed", async () => {
    const { app, store } = harness();
    const res = await app.request(
      json({
        agent_ids: ["master", "tim"],
        purpose: "Win at tic-tac-toe.",
        space_id: spaceId,
        title: "Game",
      })
    );
    expect(res.status).toBe(201);
    expect(store.mergeThreadMetadataForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: { room_purpose: "Win at tic-tac-toe." },
        userId,
      })
    );
    const body = (await res.json()) as { session: { metadata: unknown } };
    expect(body.session.metadata).toEqual({
      room_purpose: "Win at tic-tac-toe.",
    });
  });

  it("PATCH room renames and sets or clears the purpose", async () => {
    const { app, store, threads } = harness();
    const patch = (body: unknown) =>
      app.request(
        new Request(`http://x/ai/threads/${roomId}/room`, {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        })
      );
    expect((await patch({})).status).toBe(400);
    const renamed = await patch({ purpose: "Ship v2.", title: "Launch" });
    expect(renamed.status).toBe(200);
    expect(threads.updateThread).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: roomId, title: "Launch" })
    );
    expect(store.mergeThreadMetadataForUser).toHaveBeenLastCalledWith(
      expect.objectContaining({ patch: { room_purpose: "Ship v2." } })
    );
    await patch({ purpose: "" });
    expect(store.mergeThreadMetadataForUser).toHaveBeenLastCalledWith(
      expect.objectContaining({ removeKeys: ["room_purpose"] })
    );
  });

  it("lists, adds and removes people with names, but never the owner", async () => {
    const { app, people } = harness();
    const listed = await app.request(`http://x/ai/threads/${roomId}/people`);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({
      people: [{ name: "Matthias", role: "owner", user_id: userId }],
    });

    const added = await app.request(
      new Request(`http://x/ai/threads/${roomId}/people`, {
        body: JSON.stringify({ user_id: otherUserId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(added.status).toBe(200);
    expect(people.get(otherUserId)).toBe("member");
    expect((await added.json()).people).toContainEqual({
      name: "Anna",
      role: "member",
      user_id: otherUserId,
    });

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

  it("lists a person's conversations: the rooms they are in and their DMs", async () => {
    const { app, store } = harness();
    const dmId = "00000000-0000-4000-8000-000000000009";
    store.listDmsForUser.mockResolvedValueOnce([
      { ...room(), agent_id: "tim", id: dmId, route_context: { dm: true } },
    ] as never);
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
    const body = (await res.json()) as {
      dms: { agent_id: string; session: { id: string } }[];
      rooms: { members: unknown[]; session: { id: string } }[];
    };
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0]?.session.id).toBe(roomId);
    expect(body.rooms[0]?.members).toEqual([
      { agent_id: "master", role: "host" },
    ]);
    expect(body.dms).toEqual([
      { agent_id: "tim", session: expect.objectContaining({ id: dmId }) },
    ]);
  });

  it("the directory says which rooms the person joined", async () => {
    const { app } = harness();
    const res = await app.request(
      `http://x/ai/spaces/${spaceId}/rooms/directory`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rooms: { joined: boolean }[] };
    expect(body.rooms).toEqual([expect.objectContaining({ joined: false })]);
  });

  it("opens a DM once: the same private row on every call, back from the archive", async () => {
    const { app, store } = harness();
    store.getThread.mockResolvedValueOnce(null as never);
    const first = await app.request(
      new Request("http://x/ai/threads/dm", {
        body: JSON.stringify({ agent_id: "master", space_id: spaceId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(first.status).toBe(201);
    const created = (await first.json()) as {
      created: boolean;
      session: { id: string; route_context: unknown; visibility: string };
    };
    expect(created.created).toBe(true);
    expect(created.session.route_context).toEqual({ dm: true });
    expect(created.session.visibility).toBe("private");
    expect(store.upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "master",
        createdByUserId: userId,
        id: created.session.id,
        spaceId,
        title: null,
        visibility: "private",
      })
    );

    store.getThread.mockResolvedValueOnce({
      ...room(),
      id: created.session.id,
      route_context: { dm: true },
      visibility: "private",
    } as never);
    const second = await app.request(
      new Request("http://x/ai/threads/dm", {
        body: JSON.stringify({ agent_id: "master", space_id: spaceId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(second.status).toBe(200);
    const again = (await second.json()) as {
      created: boolean;
      session: { id: string };
    };
    expect(again.created).toBe(false);
    expect(again.session.id).toBe(created.session.id);

    store.getThread.mockResolvedValueOnce({
      ...room(),
      archived_at: "2026-09-08T00:00:00.000Z",
      id: created.session.id,
      route_context: { dm: true },
    } as never);
    const third = await app.request(
      new Request("http://x/ai/threads/dm", {
        body: JSON.stringify({ agent_id: "master", space_id: spaceId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(third.status).toBe(201);
    expect(
      ((await third.json()) as { session: { id: string } }).session.id
    ).toBe(created.session.id);
  });

  it("no DM with a personal agent or an unknown one", async () => {
    const { app } = harness();
    const personal = await app.request(
      new Request("http://x/ai/threads/dm", {
        body: JSON.stringify({ agent_id: "copilot", space_id: spaceId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );
    expect(personal.status).toBe(422);
    expect(await personal.json()).toEqual({ error: "agent_threads.noDm" });
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

  it("a room is opened as one, space-visible unless told private", async () => {
    const { app, store, threads } = harness();
    const open = await app.request(
      json({ agent_ids: ["master", "tim"], space_id: spaceId, title: "Game" })
    );
    expect(open.status).toBe(201);
    expect(threads.createThread).toHaveBeenCalledWith(
      expect.objectContaining({ routeContext: { room: true } })
    );
    expect(store.setThreadVisibility).not.toHaveBeenCalled();

    const closed = await app.request(
      json({
        agent_ids: ["master", "tim"],
        space_id: spaceId,
        title: "Private",
        visibility: "private",
      })
    );
    expect(closed.status).toBe(201);
    expect(store.setThreadVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: roomId, visibility: "private" })
    );
    expect(
      ((await closed.json()) as { session: { visibility: string } }).session
        .visibility
    ).toBe("private");
  });

  it("PATCH room changes who may see it", async () => {
    const { app, store } = harness();
    const res = await app.request(
      new Request(`http://x/ai/threads/${roomId}/room`, {
        body: JSON.stringify({ visibility: "private" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      })
    );
    expect(res.status).toBe(200);
    expect(store.setThreadVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "private" })
    );
  });

  it("continue lifts the pause with the same patch a message applies", async () => {
    const { app, store } = harness();
    const res = await app.request(
      new Request(`http://x/ai/threads/${roomId}/continue`, { method: "POST" })
    );
    expect(res.status).toBe(200);
    expect(store.mergeThreadMetadataForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: { agent_turns_since_human: 0, room_paused: false },
        userId,
      })
    );
  });
});
