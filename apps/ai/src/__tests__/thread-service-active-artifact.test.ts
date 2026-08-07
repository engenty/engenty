import { describe, expect, it, vi } from "vitest";
import { createThreadService } from "../ai/sessions/session-service.js";
import type { ThreadRow, ThreadStore } from "../dal/threads/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";

function makeSession(metadata: Record<string, unknown> = {}): ThreadRow {
  return {
    agent_id: "engenty.copilot",
    archived_at: null,
    created_at: "2026-05-17T00:00:00.000Z",
    created_by_user_id: userId,
    id: threadId,
    metadata,
    route_context: {},
    status: "idle",
    summary: null,
    tenant_id: tenantId,
    title: null,
    updated_at: "2026-05-17T00:00:00.000Z",
    workspace_key: null,
  };
}

function makeStore(initialMetadata: Record<string, unknown> = {}): {
  mergeThreadMetadataForUser: ReturnType<typeof vi.fn>;
  store: ThreadStore;
  updateThreadForUser: ReturnType<typeof vi.fn>;
} {
  const session = makeSession(initialMetadata);
  const updateThreadForUser = vi.fn(
    async (params: { metadata?: Record<string, unknown> }) => ({
      thread: makeSession(params.metadata ?? session.metadata),
    })
  );
  const mergeThreadMetadataForUser = vi.fn(async () => ({
    thread: makeSession(session.metadata),
  }));
  const store = {
    getThread: vi.fn(async () => session),
    mergeThreadMetadataForUser,
    updateThreadForUser,
  } as unknown as ThreadStore;
  return { mergeThreadMetadataForUser, store, updateThreadForUser };
}

function makeService(store: ThreadStore) {
  return createThreadService({
    getStore: () => store,
    getUsageStore: () => null,
    mastra: {} as never,
  });
}

describe("createThreadService.updateThread — activeArtifactId", () => {
  it("folds the key in the database instead of rewriting the whole blob", async () => {
    const { mergeThreadMetadataForUser, store, updateThreadForUser } =
      makeStore({ source: "test" });

    await makeService(store).updateThread({
      activeArtifactId: "artifact-1",
      scope: { tenantId, userId },
      threadId,
    });

    expect(mergeThreadMetadataForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: {
          active_artifact: expect.objectContaining({
            artifact_id: "artifact-1",
          }),
        },
        tenantId,
        threadId,
        userId,
      })
    );
    // The whole-column writer must not be involved: it would send metadata
    // built from a row read before the write and revert concurrent keys.
    expect(updateThreadForUser).not.toHaveBeenCalled();
  });

  it("never carries keys read from the row — the lost-update guard", async () => {
    // Whatever the pre-read row happened to contain (Mastra's own
    // metadata.mastra state-signal tracking, an open HITL interrupt, approval
    // grants), none of it may ride along in the write. If any does, a write
    // that commits between the read and this one is silently reverted.
    const { mergeThreadMetadataForUser, store } = makeStore({
      ag_ui_open_interrupt: { kind: "decision" },
      mastra: { stateSignals: { "route:win-a": { version: 2 } } },
      source: "test",
    });

    await makeService(store).updateThread({
      activeArtifactId: "artifact-1",
      scope: { tenantId, userId },
      threadId,
    });

    const { patch } = mergeThreadMetadataForUser.mock.calls[0]?.[0] as {
      patch: Record<string, unknown>;
    };
    expect(Object.keys(patch)).toEqual(["active_artifact"]);
  });

  it("clears the key by removal, not by writing a null", async () => {
    const { mergeThreadMetadataForUser, store } = makeStore({
      active_artifact: { artifact_id: "artifact-1", shown_at: "x" },
    });

    await makeService(store).updateThread({
      activeArtifactId: null,
      scope: { tenantId, userId },
      threadId,
    });

    const call = mergeThreadMetadataForUser.mock.calls[0]?.[0] as {
      patch?: unknown;
      removeKeys?: string[];
    };
    expect(call.removeKeys).toEqual(["active_artifact"]);
    expect(call.patch).toBeUndefined();
  });

  it("still writes the other fields when they accompany the artifact key", async () => {
    const { mergeThreadMetadataForUser, store, updateThreadForUser } =
      makeStore();

    await makeService(store).updateThread({
      activeArtifactId: "artifact-1",
      scope: { tenantId, userId },
      threadId,
      title: "Renamed",
    });

    expect(mergeThreadMetadataForUser).toHaveBeenCalled();
    expect(updateThreadForUser).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Renamed" })
    );
  });

  it("treats an explicit metadata object as the deliberate full replace it is", async () => {
    const { mergeThreadMetadataForUser, store, updateThreadForUser } =
      makeStore({ stale: true });

    await makeService(store).updateThread({
      activeArtifactId: "artifact-1",
      metadata: { replaced: true },
      scope: { tenantId, userId },
      threadId,
    });

    expect(mergeThreadMetadataForUser).not.toHaveBeenCalled();
    expect(updateThreadForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          active_artifact: expect.objectContaining({
            artifact_id: "artifact-1",
          }),
          replaced: true,
        },
      })
    );
  });

  it("does not touch metadata at all when activeArtifactId is omitted", async () => {
    const { mergeThreadMetadataForUser, store, updateThreadForUser } =
      makeStore({ source: "test" });

    await makeService(store).updateThread({
      scope: { tenantId, userId },
      threadId,
      title: "Renamed",
    });

    expect(mergeThreadMetadataForUser).not.toHaveBeenCalled();
    expect(updateThreadForUser).toHaveBeenCalledWith(
      expect.not.objectContaining({ metadata: expect.anything() })
    );
  });
});
