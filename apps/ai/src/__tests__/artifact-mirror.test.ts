import { describe, expect, it, vi } from "vitest";
import { mirrorArtifactToBoundStorage } from "../ai/artifacts/artifact-mirror.js";
import type { ArtifactRow, ArtifactStore } from "../dal/artifacts/index.js";

const artifact: ArtifactRow = {
  created_at: "2026-07-14T00:00:00.000Z",
  created_by: null,
  created_by_kind: "agent",
  current_version: 3,
  id: "0198aaaa-0000-7000-8000-000000000001",
  metadata: {},
  mime_type: null,
  scope_id: "project-1",
  scope_type: "project",
  size_bytes: null,
  status: "active",
  storage: "inline",
  storage_connection_id: null,
  storage_key: null,
  tenant_id: "tenant-1",
  thread_id: null,
  title: "Q3 Report — Final!",
  type: "markdown",
  updated_at: "2026-07-14T00:00:00.000Z",
};

function fakeStore(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getStorageBinding: vi.fn(async () => ({
      connection_id: "conn-1",
      created_at: "",
      created_by: null,
      folder_ref: "artifacts/",
      id: "b1",
      scope_id: "project-1",
      scope_type: "project" as const,
      tenant_id: "tenant-1",
      updated_at: "",
    })),
    get: vi.fn(async () => ({
      artifact,
      version: { version: 3, content: "# Report" },
    })),
    mergeMetadata: vi.fn(async () => artifact),
    ...overrides,
  } as unknown as ArtifactStore;
}

describe("mirrorArtifactToBoundStorage", () => {
  it("does nothing without a binding", async () => {
    const store = fakeStore({ getStorageBinding: vi.fn(async () => null) });
    const invokeTool = vi.fn();
    const result = await mirrorArtifactToBoundStorage({
      artifact,
      invokeTool,
      store,
      tenantId: "tenant-1",
    });
    expect(result).toEqual({ mirrored: false });
    expect(invokeTool).not.toHaveBeenCalled();
  });

  it("writes the current content to the bound connection and records the mirror", async () => {
    const store = fakeStore();
    const invokeTool = vi.fn(async () => ({ ref: "artifacts/q3.md" }));
    const result = await mirrorArtifactToBoundStorage({
      artifact,
      invokeTool,
      store,
      tenantId: "tenant-1",
    });

    expect(invokeTool).toHaveBeenCalledWith("connections_files_write", {
      connection_id: "conn-1",
      content_text: "# Report",
      folder_ref: "artifacts/",
      mime_type: "text/markdown",
      name: "q3-report-final-0198aaaa.md",
    });
    expect(store.mergeMetadata).toHaveBeenCalledWith({
      artifactId: artifact.id,
      patch: {
        external_mirror: expect.objectContaining({
          connection_id: "conn-1",
          ref: "artifacts/q3.md",
          version: 3,
        }),
      },
      tenantId: "tenant-1",
    });
    expect(result).toEqual({ mirrored: true, ref: "artifacts/q3.md" });
  });

  it("swallows write failures — platform storage stays authoritative", async () => {
    const store = fakeStore();
    const invokeTool = vi.fn(async () => {
      throw new Error("connection_approval_pending");
    });
    const log = vi.fn();
    const result = await mirrorArtifactToBoundStorage({
      artifact,
      invokeTool,
      log,
      store,
      tenantId: "tenant-1",
    });
    expect(result.mirrored).toBe(false);
    expect(result.error).toMatch(/approval_pending/);
    expect(store.mergeMetadata).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });
});
