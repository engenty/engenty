import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadStore } from "../../../dal/threads/index.js";
import type { ThreadRow } from "../../../dal/threads/types.js";

const emitInboxNotification = vi.fn(async (_input: unknown) => null);
vi.mock("../../../notifications/inbox.js", () => ({
  emitInboxNotification: (input: unknown) => emitInboxNotification(input),
}));

const {
  deliverToRoom,
  drainRoomQueuesForTests,
  noteHumanTurnInRoom,
  ROOM_AUTHOR_AGENT_KEY,
} = await import("../deliver.js");
const {
  ROOM_AGENT_TURNS_KEY,
  ROOM_PAUSED_KEY,
  ROOM_PURPOSE_KEY,
  ROOM_TURN_BUDGET,
} = await import("../room-turns.js");

const tenantId = "tenant-1";
const owner = "user-1";

function room(overrides: Partial<ThreadRow> = {}): ThreadRow {
  return {
    agent_id: "tom",
    archived_at: null,
    created_at: "2026-09-07T00:00:00.000Z",
    created_by_user_id: owner,
    id: "room-1",
    metadata: {},
    route_context: {},
    space_id: "space-1",
    status: "idle",
    summary: null,
    tenant_id: tenantId,
    title: "Tic-tac-toe",
    updated_at: "2026-09-07T00:00:00.000Z",
    visibility: "space",
    workspace_key: null,
    ...overrides,
  };
}

function harness(
  current: ThreadRow,
  members = ["tom", "tim"],
  people: { role: "owner" | "member"; user_id: string }[] = [
    { role: "owner", user_id: owner },
  ]
) {
  const state = { thread: current };
  const store = {
    appendMessage: vi.fn(async (_input: unknown) => ({ message: {} })),
    getThread: vi.fn(async () => state.thread),
    listUserParticipants: vi.fn(async () => people),
    listAgentMembers: vi.fn(async () =>
      members.map((agent_id) => ({
        agent_id,
        role: agent_id === state.thread.agent_id ? "host" : "member",
      }))
    ),
    mergeThreadMetadataForUser: vi.fn(async ({ patch }) => {
      state.thread = {
        ...state.thread,
        metadata: { ...state.thread.metadata, ...patch },
      };
      return { thread: state.thread };
    }),
  };
  const registry = {
    getAgentConfig: vi.fn(async (id: string) => ({
      id,
      name: id.toUpperCase(),
    })),
  };
  const turns: string[] = [];
  const runTurn = vi.fn(async (input: { agentId: string }) => {
    turns.push(input.agentId);
  });
  return { registry, runTurn, state, store, turns };
}

beforeEach(() => {
  emitInboxNotification.mockClear();
});

describe("deliverToRoom", () => {
  it("posts the message and wakes the mentioned member with a root turn", async () => {
    const h = harness(room());
    const result = await deliverToRoom({
      from: { agentId: "tim", name: "Tim" },
      mentions: ["tom"],
      registry: h.registry as never,
      roomId: "room-1",
      runTurn: h.runTurn,
      store: h.store as unknown as ThreadStore,
      tenantId,
      text: "Your move.",
    });
    await drainRoomQueuesForTests();

    expect(result).toEqual({
      addressed: ["tom"],
      agentTurns: 1,
      ok: true,
      roomId: "room-1",
    });
    expect(h.store.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        authorUserId: null,
        metadata: expect.objectContaining({ [ROOM_AUTHOR_AGENT_KEY]: "tim" }),
        role: "user",
        threadId: "room-1",
      })
    );
    const appended = h.store.appendMessage.mock.calls[0]?.[0] as unknown as {
      parts: Array<{ text: string }>;
    };
    const text = appended.parts[0]?.text;
    expect(text).toContain("**Message from Tim**");
    expect(text).toContain("Your move.");
    expect(h.turns).toEqual(["tom"]);
    expect(h.runTurn.mock.calls[0]?.[0]).toMatchObject({
      agentId: "tom",
      wakeLine: expect.stringContaining("Tim posted in this room"),
    });
    expect(h.state.thread.metadata[ROOM_AGENT_TURNS_KEY]).toBe(1);
  });

  it("with nobody mentioned the host answers; the host itself must name someone", async () => {
    const h = harness(room());
    const asMember = await deliverToRoom({
      from: { agentId: "tim", name: "Tim" },
      registry: h.registry as never,
      roomId: "room-1",
      runTurn: h.runTurn,
      store: h.store as unknown as ThreadStore,
      tenantId,
      text: "hello",
    });
    expect(asMember).toMatchObject({ addressed: ["tom"], ok: true });
    const asHost = await deliverToRoom({
      from: { agentId: "tom", name: "Tom" },
      registry: h.registry as never,
      roomId: "room-1",
      runTurn: h.runTurn,
      store: h.store as unknown as ThreadStore,
      tenantId,
      text: "hello",
    });
    expect(asHost).toMatchObject({ code: "no_addressee", ok: false });
    await drainRoomQueuesForTests();
  });

  it("refuses a sender or a mention that is not in the room", async () => {
    const h = harness(room());
    expect(
      await deliverToRoom({
        from: { agentId: "stranger", name: "S" },
        registry: h.registry as never,
        roomId: "room-1",
        runTurn: h.runTurn,
        store: h.store as unknown as ThreadStore,
        tenantId,
        text: "hi",
      })
    ).toMatchObject({ code: "not_a_member", ok: false });
    expect(
      await deliverToRoom({
        from: { agentId: "tim", name: "Tim" },
        mentions: ["stranger"],
        registry: h.registry as never,
        roomId: "room-1",
        runTurn: h.runTurn,
        store: h.store as unknown as ThreadStore,
        tenantId,
        text: "hi",
      })
    ).toMatchObject({ code: "not_a_member", ok: false });
    expect(h.store.appendMessage).not.toHaveBeenCalled();
  });

  it("runs turns one after the other and pauses at the budget", async () => {
    const h = harness(
      room({ metadata: { [ROOM_AGENT_TURNS_KEY]: ROOM_TURN_BUDGET - 1 } })
    );
    const first = await deliverToRoom({
      from: { agentId: "tim", name: "Tim" },
      mentions: ["tom"],
      registry: h.registry as never,
      roomId: "room-1",
      runTurn: h.runTurn,
      store: h.store as unknown as ThreadStore,
      tenantId,
      text: "move 11",
    });
    expect(first).toMatchObject({ ok: true });
    await drainRoomQueuesForTests();
    expect(h.turns).toEqual(["tom"]);
    expect(h.state.thread.metadata[ROOM_AGENT_TURNS_KEY]).toBe(
      ROOM_TURN_BUDGET
    );

    const second = await deliverToRoom({
      from: { agentId: "tom", name: "Tom" },
      mentions: ["tim"],
      registry: h.registry as never,
      roomId: "room-1",
      runTurn: h.runTurn,
      store: h.store as unknown as ThreadStore,
      tenantId,
      text: "move 12",
    });
    expect(second).toMatchObject({ code: "room_paused", ok: false });
    expect(h.state.thread.metadata[ROOM_PAUSED_KEY]).toBe(true);
    expect(emitInboxNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "room_paused",
        priority: "high",
        userId: owner,
      })
    );
    expect(h.turns).toEqual(["tom"]);
  });

  it("a pair room nobody owns still spends its budget and pauses silently", async () => {
    const h = harness(
      room({
        created_by_user_id: null,
        metadata: { [ROOM_AGENT_TURNS_KEY]: ROOM_TURN_BUDGET - 1 },
        route_context: { delegated: true },
      }),
      ["tom", "tim"],
      []
    );
    const last = await deliverToRoom({
      from: { agentId: "tim", name: "Tim" },
      mentions: ["tom"],
      registry: h.registry as never,
      roomId: "room-1",
      runTurn: h.runTurn,
      store: h.store as unknown as ThreadStore,
      tenantId,
      text: "again",
    });
    expect(last).toMatchObject({ ok: true });
    await drainRoomQueuesForTests();
    expect(h.state.thread.metadata[ROOM_AGENT_TURNS_KEY]).toBe(
      ROOM_TURN_BUDGET
    );
    const over = await deliverToRoom({
      from: { agentId: "tom", name: "Tom" },
      mentions: ["tim"],
      registry: h.registry as never,
      roomId: "room-1",
      runTurn: h.runTurn,
      store: h.store as unknown as ThreadStore,
      tenantId,
      text: "and again",
    });
    expect(over).toMatchObject({ code: "room_paused", ok: false });
    expect(h.state.thread.metadata[ROOM_PAUSED_KEY]).toBe(true);
    expect(h.turns).toEqual(["tom"]);
    expect(emitInboxNotification).not.toHaveBeenCalled();
  });

  it("a person's post restarts the budget and lifts the pause", async () => {
    const h = harness(
      room({
        metadata: { [ROOM_AGENT_TURNS_KEY]: 7, [ROOM_PAUSED_KEY]: true },
      })
    );
    const result = await deliverToRoom({
      from: { name: "Matthias", userId: owner },
      mentions: ["tim"],
      registry: h.registry as never,
      roomId: "room-1",
      runTurn: h.runTurn,
      store: h.store as unknown as ThreadStore,
      tenantId,
      text: "@Tim you start",
    });
    await drainRoomQueuesForTests();
    expect(result).toMatchObject({
      addressed: ["tim"],
      agentTurns: 1,
      ok: true,
    });
    expect(h.store.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ authorUserId: owner, metadata: {} })
    );
    expect(h.turns).toEqual(["tim"]);
    expect(h.state.thread.metadata[ROOM_PAUSED_KEY]).toBe(false);
    expect(h.state.thread.metadata[ROOM_AGENT_TURNS_KEY]).toBe(1);
  });

  it("the wake line carries the room's purpose and the people in it", async () => {
    const h = harness(
      room({ metadata: { [ROOM_PURPOSE_KEY]: "Win at tic-tac-toe." } }),
      ["tom", "tim"],
      [
        { role: "owner", user_id: owner },
        { role: "member", user_id: "user-2" },
      ]
    );
    await deliverToRoom({
      from: { agentId: "tim", name: "Tim" },
      mentions: ["tom"],
      registry: h.registry as never,
      resolveUserNames: async () =>
        new Map([
          [owner, "Matthias"],
          ["user-2", "Anna"],
        ]),
      roomId: "room-1",
      runTurn: h.runTurn,
      store: h.store as unknown as ThreadStore,
      tenantId,
      text: "go",
    });
    await drainRoomQueuesForTests();
    const wakeLine = (
      h.runTurn.mock.calls[0]?.[0] as unknown as { wakeLine: string }
    ).wakeLine;
    expect(wakeLine).toContain("This room is for: Win at tic-tac-toe.");
    expect(wakeLine).toContain(
      "Agents in this room: TOM (`tom`), TIM (`tim`)."
    );
    expect(wakeLine).toContain("People in this room: Matthias, Anna.");
  });

  it("a pause is told to every person in the room", async () => {
    const h = harness(
      room({ metadata: { [ROOM_AGENT_TURNS_KEY]: ROOM_TURN_BUDGET } }),
      ["tom", "tim"],
      [
        { role: "owner", user_id: owner },
        { role: "member", user_id: "user-2" },
      ]
    );
    const result = await deliverToRoom({
      from: { agentId: "tom", name: "Tom" },
      mentions: ["tim"],
      registry: h.registry as never,
      roomId: "room-1",
      runTurn: h.runTurn,
      store: h.store as unknown as ThreadStore,
      tenantId,
      text: "again",
    });
    expect(result).toMatchObject({ code: "room_paused", ok: false });
    const told = emitInboxNotification.mock.calls.map(
      (call) => (call[0] as { userId: string }).userId
    );
    expect(told.sort()).toEqual([owner, "user-2"]);
  });

  it("noteHumanTurnInRoom writes only when there is something to reset", async () => {
    const quiet = harness(room());
    await noteHumanTurnInRoom({
      scope: { tenantId, userId: owner } as never,
      store: quiet.store as unknown as ThreadStore,
      threadId: "room-1",
    });
    expect(quiet.store.mergeThreadMetadataForUser).not.toHaveBeenCalled();

    const busy = harness(room({ metadata: { [ROOM_AGENT_TURNS_KEY]: 3 } }));
    await noteHumanTurnInRoom({
      scope: { tenantId, userId: owner } as never,
      store: busy.store as unknown as ThreadStore,
      threadId: "room-1",
    });
    expect(busy.state.thread.metadata[ROOM_AGENT_TURNS_KEY]).toBe(0);
  });
});
