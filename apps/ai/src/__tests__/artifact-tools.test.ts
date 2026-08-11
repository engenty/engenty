import { describe, expect, it, vi } from "vitest";
import { createArtifactTools } from "../../ai/tools/artifact-tools.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import {
  type ArtifactStore,
  ArtifactVersionConflictError,
} from "../dal/artifacts/index.js";
import { testToolContext } from "./helpers/tool-context.js";

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
        tools.artifact_write.execute!(
          { type: "markdown", title: "T", content: "# hi" } as never,
          testToolContext()
        )
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
        tools.artifact_write.execute!(
          { type: "markdown", title: "T", content: "# hi" } as never,
          testToolContext()
        )
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
        tools.artifact_write.execute!(
          {
            artifact_id: "a1",
            content: "x",
            expected_version: 1,
            summary: "s",
          } as never,
          testToolContext()
        )
    );

    expect(result).toEqual({ current_version: 5, error: "version_conflict" });
  });

  // The verb is implied by the arguments now that five tools collapsed into
  // two, so the argument combinations ARE the contract.
  it("updates when an id is supplied and creates when it is not", async () => {
    const store = fakeStore();
    const tools = createArtifactTools({ store });

    const updated = await runWithContext(
      { tenantId, orchestratorThreadId: threadId, userId: "u1" },
      () =>
        tools.artifact_write.execute!(
          {
            artifact_id: "a1",
            content: "x",
            expected_version: 1,
            summary: "s",
          } as never,
          testToolContext()
        )
    );

    expect(updated).toEqual({ artifact_id: "a1", version: 2 });
    expect(store.create).not.toHaveBeenCalled();
  });

  it("reports the missing field instead of guessing the verb", async () => {
    const store = fakeStore();
    const tools = createArtifactTools({ store });

    const result = await runWithContext(
      { tenantId, orchestratorThreadId: threadId, userId: "u1" },
      () =>
        tools.artifact_write.execute!(
          { artifact_id: "a1", content: "x" } as never,
          testToolContext()
        )
    );

    expect(result).toEqual({ error: "expected_version_required" });
    expect(store.addVersion).not.toHaveBeenCalled();
  });

  it("lists the chat's artifacts when read is given no id", async () => {
    const store = fakeStore({
      listByScope: vi.fn(async () => [
        { current_version: 3, id: "a1", title: "T", type: "markdown" } as never,
      ]),
    });
    const tools = createArtifactTools({ store });

    const result = await runWithContext(
      { tenantId, orchestratorThreadId: threadId, userId: "u1" },
      () => tools.artifact_read.execute!({} as never, testToolContext())
    );

    expect(result).toEqual({
      artifacts: [
        { artifact_id: "a1", title: "T", type: "markdown", version: 3 },
      ],
    });
  });
});
