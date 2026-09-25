import { describe, expect, it } from "vitest";
import { createThreadStore } from "./thread-store.js";

const TENANT = "00000000-0000-4000-8000-000000000001";
const SPACE = "019fe8ec-0000-4000-8000-00000000000a";

/**
 * Answers every query on a table with that table's rows. Filtering happens in
 * SQL and is proven in thread-store.integration.test.ts; these tests cover what
 * the store decides in code after the rows come back.
 */
function makeClient(results: Record<string, unknown[]>) {
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    for (const op of ["eq", "in", "is", "limit", "or", "order", "select"]) {
      b[op] = () => b;
    }
    // biome-ignore lint/suspicious/noThenProperty: mock of a thenable Supabase query builder
    b.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve({ data: results[table] ?? [], error: null }));
    return b;
  }
  return { client: { schema: () => ({ from: builder }) } as never };
}

describe("thread store — rooms", () => {
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
    const { client } = makeClient({
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
});
