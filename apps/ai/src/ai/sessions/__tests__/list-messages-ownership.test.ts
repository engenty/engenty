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
    ).resolves.toEqual({ messages: [] });
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
