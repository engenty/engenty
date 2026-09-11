import { describe, expect, it, vi } from "vitest";
import type { ThreadStore } from "../../../dal/threads/thread-store.js";
import {
  agentPairThreadId,
  resolveAgentPairThread,
} from "../agent-pair-thread.js";

describe("agent pair thread", () => {
  it("is one thread per Space and pair, whichever side starts", () => {
    const a = agentPairThreadId({
      agentA: "chief-of-staff",
      agentB: "inbox.overview",
      spaceId: "space-1",
    });
    const b = agentPairThreadId({
      agentA: "inbox.overview",
      agentB: "chief-of-staff",
      spaceId: "space-1",
    });
    expect(a).toBe(b);
    expect(
      agentPairThreadId({
        agentA: "chief-of-staff",
        agentB: "inbox.overview",
        spaceId: "space-2",
      })
    ).not.toBe(a);
  });

  it("reuses the existing thread and otherwise creates a read-only one owned by the colleague", async () => {
    const upsertThread = vi.fn(async (input: { id?: string }) => ({
      thread: { id: input.id },
    }));
    const getThread = vi.fn(async () => null);
    const addAgentMember = vi.fn(async () => {});
    const store = {
      addAgentMember,
      getThread,
      getThreadMetadata: vi.fn(async () => null),
      upsertThread,
    } as unknown as ThreadStore;
    const { agentId, id } = await resolveAgentPairThread({
      colleagueId: "inbox.overview",
      colleagueName: "Inbox Overview Assistant",
      ownerUserId: "user-1",
      senderId: "chief-of-staff",
      senderName: "Chief of Staff",
      spaceId: "space-1",
      store,
      tenantId: "tenant-1",
    });
    expect(agentId).toBe("inbox.overview");
    expect(id).toBe(
      agentPairThreadId({
        agentA: "chief-of-staff",
        agentB: "inbox.overview",
        spaceId: "space-1",
      })
    );
    expect(upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "inbox.overview",
        createdByUserId: "user-1",
        routeContext: { delegated: true },
        spaceId: "space-1",
        title: "Chief of Staff ⇄ Inbox Overview Assistant",
      })
    );
    // The colleague hosts (the upsert writes that row); the sender joins.
    expect(addAgentMember).toHaveBeenCalledWith({
      agentId: "chief-of-staff",
      tenantId: "tenant-1",
      threadId: id,
    });

    getThread.mockResolvedValueOnce({
      agent_id: "inbox.overview",
      archived_at: null,
      id,
    } as never);
    upsertThread.mockClear();
    const reverse = await resolveAgentPairThread({
      colleagueId: "chief-of-staff",
      colleagueName: "Chief of Staff",
      ownerUserId: "user-1",
      senderId: "inbox.overview",
      senderName: "Inbox Overview Assistant",
      spaceId: "space-1",
      store,
      tenantId: "tenant-1",
    });
    expect(upsertThread).not.toHaveBeenCalled();
    expect(addAgentMember).toHaveBeenCalledTimes(1);
    // Reverse direction: same thread, still listed on the first colleague's desk.
    expect(reverse).toEqual({ agentId: "inbox.overview", id });
  });
});
