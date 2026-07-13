import { describe, expect, it, vi } from "vitest";
import { createArtifactTools } from "../../ai/tools/artifact-tools.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import {
  type ArtifactStore,
  ArtifactVersionConflictError,
} from "../dal/artifacts/index.js";

const tenantId = "tenant-1";
const threadId = "thread-1";

function fakeStore(overrides: Partial<ArtifactStore> = {}): ArtifactStore {
  return {
    create: vi.fn(async () => ({
      artifact: { id: "a1" } as never,
      version: { version: 1 } as never,
    })),
    get: vi.fn(async () => null),
    listByScope: vi.fn(async () => []),
    addVersion: vi.fn(async () => ({
      artifact: { id: "a1" } as never,
      version: { version: 2 } as never,
    })),
    updateScope: vi.fn(async () => null),
    setStatus: vi.fn(async () => null),
    ...overrides,
  } as ArtifactStore;
}

function runWithContext<T>(
  ctx: { tenantId?: string; orchestratorThreadId?: string; userId?: string },
  fn: () => Promise<T>
): Promise<T> {
  return engentyToolsRunAls.run(ctx as never, fn);
}

describe("artifact tools", () => {
  it("creates a thread-scoped artifact from the run context", async () => {
    const store = fakeStore();
    const tools = createArtifactTools({ store });

    const result = await runWithContext(
      { tenantId, orchestratorThreadId: threadId, userId: "u1" },
      () =>
        tools.artifact_create.execute({
          type: "markdown",
          title: "T",
          content: "# hi",
        } as never)
    );

    expect(result).toEqual({ artifact_id: "a1", version: 1 });
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        scopeType: "thread",
        scopeId: threadId,
        threadId,
        createdByKind: "agent",
      })
    );
  });

  it("refuses to create without an active thread and never touches the store", async () => {
    const store = fakeStore();
    const tools = createArtifactTools({ store });

    await expect(
      runWithContext({ tenantId }, () =>
        tools.artifact_create.execute({
          type: "markdown",
          title: "T",
          content: "# hi",
        } as never)
      )
    ).rejects.toThrow(/no active thread/i);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("maps a version conflict to a retryable result instead of throwing", async () => {
    const store = fakeStore({
      addVersion: vi.fn(async () => {
        throw new ArtifactVersionConflictError(5);
      }),
    });
    const tools = createArtifactTools({ store });

    const result = await runWithContext(
      { tenantId, orchestratorThreadId: threadId, userId: "u1" },
      () =>
        tools.artifact_update.execute({
          artifact_id: "a1",
          content: "x",
          expected_version: 1,
          summary: "s",
        } as never)
    );

    expect(result).toEqual({ error: "version_conflict", current_version: 5 });
  });
});
