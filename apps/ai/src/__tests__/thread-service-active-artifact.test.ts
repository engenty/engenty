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
  store: ThreadStore;
  updateThreadForUser: ReturnType<typeof vi.fn>;
} {
  const session = makeSession(initialMetadata);
  const updateThreadForUser = vi.fn(
    async (params: { metadata?: Record<string, unknown> }) => ({
      thread: makeSession(params.metadata ?? session.metadata),
    })
  );
  const store = {
    getThread: vi.fn(async () => session),
    updateThreadForUser,
  } as unknown as ThreadStore;
  return { store, updateThreadForUser };
}

describe("createThreadService.updateThread — activeArtifactId merge", () => {
  it("merges the active-artifact key into the CURRENT row's metadata, leaving other keys untouched", async () => {
    const { store, updateThreadForUser } = makeStore({
      source: "test",
      ag_ui_open_interrupt: { kind: "decision" },
    });
    const service = createThreadService({
      getStore: () => store,
      getUsageStore: () => null,
      mastra: {} as never,
    });

    await service.updateThread({
      activeArtifactId: "artifact-1",
      scope: { tenantId, userId },
      threadId,
    });

    expect(updateThreadForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          source: "test",
          ag_ui_open_interrupt: { kind: "decision" },
          active_artifact: expect.objectContaining({
            artifact_id: "artifact-1",
          }),
        }),
      })
    );
  });

  it("clears the key when activeArtifactId is null", async () => {
    const { store, updateThreadForUser } = makeStore({
      active_artifact: { artifact_id: "artifact-1", shown_at: "x" },
    });
    const service = createThreadService({
      getStore: () => store,
      getUsageStore: () => null,
      mastra: {} as never,
    });

    await service.updateThread({
      activeArtifactId: null,
      scope: { tenantId, userId },
      threadId,
    });

    expect(updateThreadForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.not.objectContaining({
          active_artifact: expect.anything(),
        }),
      })
    );
  });

  it("does not touch metadata at all when activeArtifactId is omitted", async () => {
    const { store, updateThreadForUser } = makeStore({ source: "test" });
    const service = createThreadService({
      getStore: () => store,
      getUsageStore: () => null,
      mastra: {} as never,
    });

    await service.updateThread({
      scope: { tenantId, userId },
      threadId,
      title: "Renamed",
    });

    expect(updateThreadForUser).toHaveBeenCalledWith(
      expect.not.objectContaining({ metadata: expect.anything() })
    );
  });
});
