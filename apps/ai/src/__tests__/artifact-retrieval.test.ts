import { describe, expect, it, vi } from "vitest";
import {
  buildArtifactSearchText,
  withArtifactIndexing,
} from "../dal/artifacts/artifact-retrieval-source.js";
import type { ArtifactStore } from "../dal/artifacts/index.js";

const artifactRow = {
  current_version: 2,
  id: "a1",
  scope_id: "p1",
  scope_type: "project",
  status: "active",
  title: "Notes",
  type: "markdown",
  updated_at: "2026-07-14T00:00:00.000Z",
};

function fakeStore(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    create: vi.fn(async () => ({
      artifact: artifactRow,
      version: { version: 1, content: "x" },
    })),
    addVersion: vi.fn(async () => ({
      artifact: artifactRow,
      version: { version: 2, content: "y" },
    })),
    updateScope: vi.fn(async () => artifactRow),
    setStatus: vi.fn(async () => ({ ...artifactRow, status: "archived" })),
    ...overrides,
  } as unknown as ArtifactStore;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("withArtifactIndexing", () => {
  it("refreshes the index after create/addVersion/updateScope and removes on archive", async () => {
    const refreshArtifact = vi.fn(async () => {
      return;
    });
    const removeArtifact = vi.fn(async () => {
      return;
    });
    const store = withArtifactIndexing(fakeStore(), {
      refreshArtifact,
      removeArtifact,
    });

    await store.create({ tenantId: "t1" } as never);
    await store.addVersion({ artifactId: "a1", tenantId: "t1" } as never);
    await store.updateScope({ tenantId: "t1" } as never);
    await store.setStatus({ tenantId: "t1" } as never);
    await flush();

    expect(refreshArtifact).toHaveBeenCalledTimes(3);
    expect(refreshArtifact).toHaveBeenCalledWith({
      artifact_id: "a1",
      tenant_id: "t1",
    });
    expect(removeArtifact).toHaveBeenCalledWith({
      artifact_id: "a1",
      tenant_id: "t1",
    });
  });

  it("indexing failures never fail the write", async () => {
    const log = vi.fn();
    const store = withArtifactIndexing(
      fakeStore(),
      {
        refreshArtifact: vi.fn(async () => {
          throw new Error("search schema down");
        }),
        removeArtifact: vi.fn(),
      },
      log
    );
    await expect(
      store.create({ tenantId: "t1" } as never)
    ).resolves.toBeTruthy();
    await flush();
    expect(log).toHaveBeenCalled();
  });
});

describe("buildArtifactSearchText", () => {
  it("joins title and content; strips tags for html artifacts", () => {
    expect(
      buildArtifactSearchText({ title: "Doc", type: "markdown" }, "# Hello")
    ).toBe("Doc\n\n# Hello");
    expect(
      buildArtifactSearchText(
        { title: "Page", type: "html" },
        "<h1>Hi</h1><p>there</p>"
      )
    ).toBe("Page\n\nHi there");
  });
});
