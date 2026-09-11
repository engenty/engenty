import { describe, expect, it } from "vitest";
import { createThreadStore } from "./thread-store.js";

const TENANT = "00000000-0000-4000-8000-000000000001";
const SPACE = "019fe8ec-0000-4000-8000-00000000000a";

/**
 * Chainable supabase fake that records the filters each table received, so a
 * test can assert WHICH rooms were asked for rather than only what came back.
 */
function makeClient(results: Record<string, unknown[]>) {
  const calls: Record<string, { args: unknown[]; op: string }[]> = {};
  function builder(table: string) {
    calls[table] ??= [];
    const log = calls[table];
    const b: Record<string, unknown> = {};
    for (const op of [
      "eq",
      "in",
      "is",
      "limit",
      "or",
      "order",
      "select",
      "upsert",
    ]) {
      b[op] = (...args: unknown[]) => {
        log.push({ args, op });
        return b;
      };
    }
    // biome-ignore lint/suspicious/noThenProperty: mock of a thenable Supabase query builder
    b.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve({ data: results[table] ?? [], error: null }));
    return b;
  }
  return {
    calls,
    client: { schema: () => ({ from: builder }) } as never,
  };
}

describe("thread store — rooms", () => {
  it("lists the rooms an agent hosts and the ones it was added to", async () => {
    const { calls, client } = makeClient({
      thread: [
        {
          agent_id: "tom",
          id: "room-1",
          metadata: {},
          route_context: {},
          space_id: SPACE,
          tenant_id: TENANT,
        },
      ],
      thread_agent: [{ thread_id: "room-1" }, { thread_id: "room-2" }],
    });
    const store = createThreadStore(client);

    const rows = await store.listThreadsForSpaceAgent({
      agentId: "tim",
      spaceId: SPACE,
      tenantId: TENANT,
    });

    expect(rows.map((row) => row.id)).toEqual(["room-1"]);
    expect(calls.thread_agent?.map((c) => c.op)).toEqual([
      "select",
      "eq",
      "eq",
    ]);
    const orFilter = calls.thread?.find((c) => c.op === "or");
    expect(orFilter?.args).toEqual(["agent_id.eq.tim,id.in.(room-1,room-2)"]);
    expect(calls.thread?.some((c) => c.op === "is")).toBe(true);
  });

  it("falls back to the host column when the agent is in no room yet", async () => {
    const { calls, client } = makeClient({ thread: [], thread_agent: [] });
    await createThreadStore(client).listThreadsForSpaceAgent({
      agentId: "tim",
      includeArchived: true,
      spaceId: SPACE,
      tenantId: TENANT,
    });
    expect(calls.thread?.some((c) => c.op === "or")).toBe(false);
    expect(
      calls.thread?.find((c) => c.op === "eq" && c.args[0] === "agent_id")?.args
    ).toEqual(["agent_id", "tim"]);
    expect(calls.thread?.some((c) => c.op === "is")).toBe(false);
  });

  it("adds a member idempotently and lists the room's agents", async () => {
    const { calls, client } = makeClient({
      thread_agent: [
        { agent_id: "tom", role: "host", thread_id: "room-1" },
        { agent_id: "tim", role: "member", thread_id: "room-1" },
      ],
    });
    const store = createThreadStore(client);

    await store.addAgentMember({
      agentId: "tim",
      tenantId: TENANT,
      threadId: "room-1",
    });
    const upsert = calls.thread_agent?.find((c) => c.op === "upsert");
    expect(upsert?.args).toEqual([
      {
        agent_id: "tim",
        role: "member",
        tenant_id: TENANT,
        thread_id: "room-1",
      },
      { ignoreDuplicates: true, onConflict: "thread_id,agent_id" },
    ]);

    const members = await store.listAgentMembers({
      tenantId: TENANT,
      threadId: "room-1",
    });
    expect(members.map((m) => `${m.agent_id}:${m.role}`)).toEqual([
      "tom:host",
      "tim:member",
    ]);
  });

  it("lists only the rooms a person is in, with their agents", async () => {
    const shared = {
      agent_id: "tom",
      id: "room-mine",
      metadata: {},
      route_context: { room: true },
      space_id: SPACE,
      tenant_id: TENANT,
      visibility: "space",
    };
    const { calls, client } = makeClient({
      thread: [
        shared,
        {
          ...shared,
          id: "pair",
          route_context: { room: true, delegated: true },
        },
      ],
      thread_agent: [
        { agent_id: "tom", role: "host", thread_id: "room-mine" },
        { agent_id: "tim", role: "member", thread_id: "room-mine" },
      ],
      thread_participant: [{ thread_id: "room-mine" }, { thread_id: "pair" }],
    });
    const rooms = await createThreadStore(client).listRoomsForSpace({
      spaceId: SPACE,
      tenantId: TENANT,
      viewerUserId: "user-1",
    });
    expect(rooms.map((room) => room.thread.id)).toEqual(["room-mine"]);
    expect(rooms[0]?.members.map((m) => m.agent_id)).toEqual(["tom", "tim"]);
    expect(
      calls.thread?.find((c) => c.op === "in" && c.args[0] === "id")?.args
    ).toEqual(["id", ["room-mine", "pair"]]);
    expect(
      calls.thread?.find(
        (c) => c.op === "eq" && c.args[0] === "route_context->>room"
      )?.args
    ).toEqual(["route_context->>room", "true"]);
  });

  it("lists nothing for a person in no room, without asking the thread table", async () => {
    const { calls, client } = makeClient({
      thread: [],
      thread_participant: [],
    });
    const rooms = await createThreadStore(client).listRoomsForSpace({
      spaceId: SPACE,
      tenantId: TENANT,
      viewerUserId: "user-1",
    });
    expect(rooms).toEqual([]);
    expect(calls.thread).toBeUndefined();
  });

  it("the directory lists every room a person may read, saying which they joined", async () => {
    const shared = {
      agent_id: "tom",
      id: "room-open",
      metadata: {},
      route_context: { room: true },
      space_id: SPACE,
      tenant_id: TENANT,
      visibility: "space",
    };
    const { client } = makeClient({
      thread: [
        shared,
        { ...shared, id: "room-mine", visibility: "private" },
        { ...shared, id: "room-theirs", visibility: "private" },
      ],
      thread_agent: [
        { agent_id: "tom", role: "host", thread_id: "room-open" },
        { agent_id: "tom", role: "host", thread_id: "room-mine" },
      ],
      thread_participant: [{ thread_id: "room-mine" }],
    });
    const rooms = await createThreadStore(client).listSpaceRoomsDirectory({
      spaceId: SPACE,
      tenantId: TENANT,
      viewerUserId: "user-1",
    });
    expect(rooms.map((room) => [room.thread.id, room.joined])).toEqual([
      ["room-open", false],
      ["room-mine", true],
    ]);
  });

  it("lists a person's DMs by the marker and the owner column", async () => {
    const { calls, client } = makeClient({
      thread: [
        {
          agent_id: "tom",
          created_by_user_id: "user-1",
          id: "dm-1",
          metadata: {},
          route_context: { dm: true },
          space_id: SPACE,
          tenant_id: TENANT,
          visibility: "private",
        },
      ],
    });
    const dms = await createThreadStore(client).listDmsForUser({
      spaceId: SPACE,
      tenantId: TENANT,
      userId: "user-1",
    });
    expect(dms.map((dm) => dm.id)).toEqual(["dm-1"]);
    const eqs = calls.thread?.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["created_by_user_id", "user-1"]);
    expect(eqs).toContainEqual(["route_context->>dm", "true"]);
  });
});
