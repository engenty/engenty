import { describe, expect, it, vi } from "vitest";
import { createThreadService } from "../session-service.js";
import type { ThreadServiceOptions } from "../types.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const owner = "00000000-0000-4000-8000-000000000002";
const otherUser = "00000000-0000-4000-8000-000000000003";
const threadId = "00000000-0000-4000-8000-000000000004";

function makeService(listMessagesOrdered = vi.fn(async () => [])) {
  const store = {
    // Deliberately tenant-scoped only, mirroring the real store: it is the
    // service's job to enforce ownership on top.
    getThread: vi.fn(async () => ({
      created_by_user_id: owner,
      id: threadId,
      tenant_id: tenantId,
    })),
    listMessagesOrdered,
  };
  const service = createThreadService({
    getStore: () => store,
  } as unknown as ThreadServiceOptions);
  return { listMessagesOrdered, service, store };
}

describe("listMessages ownership", () => {
  it("returns the transcript to the thread's owner", async () => {
    const { service, listMessagesOrdered } = makeService();
    await expect(
      service.listMessages({
        scope: { tenantId, userId: owner },
        threadId,
      } as never)
    ).resolves.toEqual({ has_more: false, messages: [] });
    expect(listMessagesOrdered).toHaveBeenCalled();
  });

  it("refuses another user in the same tenant", async () => {
    // The tenant boundary is not the whole boundary. Anyone holding a thread
    // UUID used to be able to read a colleague's conversation.
    const { service, listMessagesOrdered } = makeService();
    await expect(
      service.listMessages({
        scope: { tenantId, userId: otherUser },
        threadId,
      } as never)
    ).rejects.toMatchObject({ code: "agent_threads.notFound" });
    // And it must not have read the rows before deciding.
    expect(listMessagesOrdered).not.toHaveBeenCalled();
  });

  it("reports not-found rather than forbidden", async () => {
    // Distinguishing the two would confirm the thread exists to someone who
    // cannot see it — the sibling methods answer notFound for the same reason.
    const { service } = makeService();
    await expect(
      service.listMessages({
        scope: { tenantId, userId: otherUser },
        threadId,
      } as never)
    ).rejects.toMatchObject({ code: "agent_threads.notFound" });
  });
});

describe("listMessages delta page (after)", () => {
  // Five rows in transcript order. The fake store answers like the real one:
  // strictly after (created_at, id), ascending, at most `limit` rows.
  const rows = [1, 2, 3, 4, 5].map((n) => ({
    created_at: `2026-09-24T10:00:0${n}.000000+00:00`,
    id: `00000000-0000-4000-8000-00000000010${n}`,
    metadata: {},
    parts: [],
    role: "assistant",
  }));
  const listMessagesOrdered = vi.fn(
    async (params: { afterId?: string; limit: number }) => {
      const start = rows.findIndex((row) => row.id === params.afterId) + 1;
      return rows.slice(start, start + params.limit);
    }
  );

  it("returns the next newer rows oldest first and says more newer exist", async () => {
    const { service } = makeService(listMessagesOrdered as never);
    const page = await service.listMessages({
      after: { createdAt: rows[0].created_at, id: rows[0].id },
      limit: 2,
      scope: { tenantId, userId: owner },
      threadId,
    } as never);
    expect(page.messages.map((m) => m.id)).toEqual([rows[1].id, rows[2].id]);
    expect(page.has_more).toBe(true);
  });

  it("reports no more once the delta reaches the newest row", async () => {
    const { service } = makeService(listMessagesOrdered as never);
    const page = await service.listMessages({
      after: { createdAt: rows[2].created_at, id: rows[2].id },
      limit: 2,
      scope: { tenantId, userId: owner },
      threadId,
    } as never);
    expect(page.messages.map((m) => m.id)).toEqual([rows[3].id, rows[4].id]);
    expect(page.has_more).toBe(false);
  });
});
