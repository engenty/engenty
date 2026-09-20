import { describe, expect, it, vi } from "vitest";
import type { ThreadStore } from "../../../dal/threads/index.js";
import type { ThreadRow } from "../../../dal/threads/types.js";
import { resolveSpecialistChatThread } from "../specialist-chat-thread.js";

const tenantId = "tenant-1";
const spaceId = "space-1";

function thread(overrides: Partial<ThreadRow>): ThreadRow {
  return {
    agent_id: "tim",
    archived_at: null,
    created_at: "2026-09-07T00:00:00.000Z",
    created_by_user_id: "user-a",
    id: "t",
    metadata: {},
    route_context: {},
    space_id: spaceId,
    status: "idle",
    summary: null,
    tenant_id: tenantId,
    title: null,
    updated_at: "2026-09-07T00:00:00.000Z",
    visibility: "space",
    workspace_key: null,
    ...overrides,
  };
}

function storeWith(threads: ThreadRow[]) {
  return {
    getThread: vi.fn(async () => null),
    listThreadsForSpaceAgent: vi.fn(async () => threads),
    upsertThread: vi.fn(async (input: { id: string }) => ({
      thread: thread({ id: input.id }),
    })),
  };
}

describe("resolveSpecialistChatThread", () => {
  it("picks the specialist's newest conversation, whoever started it", async () => {
    const store = storeWith([
      thread({
        created_by_user_id: "user-b",
        id: "shared-newest",
        updated_at: "2026-09-07T12:00:00.000Z",
      }),
      thread({
        created_by_user_id: "user-a",
        id: "owner-older",
        updated_at: "2026-09-07T09:00:00.000Z",
      }),
    ]);
    const id = await resolveSpecialistChatThread({
      agentId: "tim",
      ownerUserId: "user-a",
      spaceId,
      store: store as unknown as ThreadStore,
      tenantId,
      threadSeed: "seed",
      title: "Tim",
    });
    expect(id).toBe("shared-newest");
    expect(store.upsertThread).not.toHaveBeenCalled();
  });

  it("skips rooms it only sits in, run threads, pair rooms, rooms and DMs", async () => {
    const store = storeWith([
      thread({ agent_id: "tom", id: "toms-room-tim-is-in" }),
      thread({ id: "fire", route_context: { routine_id: "r1" } }),
      thread({ id: "pair", route_context: { delegated: true } }),
      thread({ id: "room", route_context: { room: true } }),
      thread({ id: "dm", route_context: { dm: true }, visibility: "private" }),
      thread({ created_by_user_id: null, id: "ownerless" }),
      thread({ id: "desk", updated_at: "2026-09-06T00:00:00.000Z" }),
    ]);
    const id = await resolveSpecialistChatThread({
      agentId: "tim",
      ownerUserId: "user-a",
      spaceId,
      store: store as unknown as ThreadStore,
      tenantId,
      threadSeed: "seed",
      title: "Tim",
    });
    expect(id).toBe("desk");
  });

  it("opens the first conversation for the person it is for", async () => {
    const store = storeWith([]);
    const id = await resolveSpecialistChatThread({
      agentId: "tim",
      ownerUserId: "user-a",
      spaceId,
      store: store as unknown as ThreadStore,
      tenantId,
      threadSeed: "seed",
      title: "Tim",
    });
    expect(id).toBeTruthy();
    expect(store.upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "tim",
        createdByUserId: "user-a",
        spaceId,
        title: "Tim",
      })
    );
  });

  it("opens no chat without a person, but speaks into one that exists", async () => {
    // A continuation runs without the actor's identity, and a thread row's
    // author has to be a real user — so an ownerless caller can find the
    // conversation but never start it.
    const empty = storeWith([]);
    expect(
      await resolveSpecialistChatThread({
        agentId: "tim",
        ownerUserId: null,
        spaceId,
        store: empty as unknown as ThreadStore,
        tenantId,
        threadSeed: "seed",
        title: "Tim",
      })
    ).toBeNull();
    expect(empty.upsertThread).not.toHaveBeenCalled();

    const existing = storeWith([thread({ id: "desk-1" })]);
    expect(
      await resolveSpecialistChatThread({
        agentId: "tim",
        ownerUserId: null,
        spaceId,
        store: existing as unknown as ThreadStore,
        tenantId,
        threadSeed: "seed",
        title: "Tim",
      })
    ).toBe("desk-1");
  });

  it("has no chat without a Space", async () => {
    const store = storeWith([]);
    expect(
      await resolveSpecialistChatThread({
        agentId: "tim",
        ownerUserId: "user-1",
        spaceId: null,
        store: store as unknown as ThreadStore,
        tenantId,
        threadSeed: "seed",
        title: "Tim",
      })
    ).toBeNull();
    expect(store.listThreadsForSpaceAgent).not.toHaveBeenCalled();
  });
});
