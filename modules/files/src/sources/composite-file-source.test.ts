import type { FileSource, FileSourceContext } from "@engenty/file-storage";
import { FileSourceReadOnlyError } from "@engenty/file-storage";
import { describe, expect, it, vi } from "vitest";
import { createCompositeFileSource } from "./composite-file-source.js";
import type { ConnectorMountRow } from "./connector-file-source.js";
import { createConnectorFileSource } from "./connector-file-source.js";
import { encodeConnectorNodeId } from "./connector-ref.js";

const ctx: FileSourceContext = {
  owner: { id: "project-1", type: "project" },
  principalId: "user-1",
  tenantId: "tenant-1",
};

const MOUNT_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const CONNECTION_ID = "9b2f1c44-0000-4000-8000-000000000001";

const mountRow: ConnectorMountRow = {
  connectionId: CONNECTION_ID,
  createdAt: "2026-07-01T00:00:00Z",
  id: MOUNT_ID,
  name: "Shared Drive",
  parentId: null,
  source: "gdrive",
  sourceFolderId: "drive-folder-1",
  updatedAt: "2026-07-01T00:00:00Z",
};

function fakeNative(): FileSource {
  return {
    kind: "native",
    listFolder: vi.fn(async () => ({ files: [], folders: [] })),
    getDownloadUrl: vi.fn(async () => "https://native/url"),
    createFolder: vi.fn(async () => ({}) as never),
    beginUpload: vi.fn(async () => ({}) as never),
    finalizeUpload: vi.fn(async () => ({}) as never),
    renameFolder: vi.fn(async () => ({}) as never),
    moveFolder: vi.fn(async () => ({}) as never),
    deleteFolder: vi.fn(async () => undefined),
    renameFile: vi.fn(async () => ({}) as never),
    moveFile: vi.fn(async () => ({}) as never),
    deleteFile: vi.fn(async () => undefined),
  };
}

function makeClient() {
  return {
    filesList: vi.fn(async () => ({
      entries: [
        {
          kind: "folder" as const,
          mime_type: null,
          modified_at: "2026-07-02T00:00:00Z",
          name: "reports",
          ref: "drive-folder-2",
          size: null,
        },
        {
          kind: "file" as const,
          mime_type: "application/pdf",
          modified_at: "2026-07-03T00:00:00Z",
          name: "q2.pdf",
          ref: "drive-file-9",
          size: 1000,
        },
      ],
      next_cursor: "page-2",
    })),
    filesRead: vi.fn(async () => ({
      expires_at: null,
      kind: "url" as const,
      mime_type: "application/pdf",
      name: "q2.pdf",
      size: 1000,
      url: "https://signed/q2.pdf",
    })),
  };
}

function build() {
  const native = fakeNative();
  const client = makeClient();
  const getMount = vi.fn(async (_ctx: FileSourceContext, folderId: string) =>
    folderId === MOUNT_ID ? mountRow : null
  );
  const connector = createConnectorFileSource({ client, getMount });
  const composite = createCompositeFileSource({ connector, getMount, native });
  return { client, composite, native };
}

describe("composite file source", () => {
  it("routes the space root to the native source", async () => {
    const { composite, native } = build();
    await composite.listFolder(ctx, null);
    expect(native.listFolder).toHaveBeenCalled();
  });

  it("lists a mount root through the connector with virtual child ids", async () => {
    const { client, composite, native } = build();
    const listing = await composite.listFolder(ctx, MOUNT_ID);
    expect(native.listFolder).not.toHaveBeenCalled();
    expect(client.filesList).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: CONNECTION_ID,
        folderRef: "drive-folder-1",
        tenantId: "tenant-1",
      })
    );
    expect(listing.readOnly).toBe(true);
    expect(listing.cursor).toBe("page-2");
    expect(listing.folders[0]).toMatchObject({
      id: encodeConnectorNodeId(CONNECTION_ID, "drive-folder-2"),
      name: "reports",
      readOnly: true,
      source: "gdrive",
    });
    expect(listing.files[0]).toMatchObject({
      mimeType: "application/pdf",
      name: "q2.pdf",
      readOnly: true,
      sizeBytes: 1000,
    });
  });

  it("descends into virtual folders by decoding their ref", async () => {
    const { client, composite } = build();
    const virtualId = encodeConnectorNodeId(CONNECTION_ID, "drive-folder-2");
    await composite.listFolder(ctx, virtualId);
    expect(client.filesList).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: CONNECTION_ID,
        folderRef: "drive-folder-2",
      })
    );
  });

  it("resolves connector downloads to the provider URL", async () => {
    const { composite } = build();
    const fileId = encodeConnectorNodeId(CONNECTION_ID, "drive-file-9");
    await expect(composite.getDownloadUrl(ctx, fileId)).resolves.toBe(
      "https://signed/q2.pdf"
    );
  });

  it("blocks mutations on and into mounts", async () => {
    const { composite } = build();
    const virtualId = encodeConnectorNodeId(CONNECTION_ID, "drive-file-9");
    await expect(composite.deleteFile(ctx, virtualId)).rejects.toBeInstanceOf(
      FileSourceReadOnlyError
    );
    await expect(
      composite.createFolder(ctx, MOUNT_ID, "new")
    ).rejects.toBeInstanceOf(FileSourceReadOnlyError);
    await expect(
      composite.beginUpload(ctx, {
        filename: "a.txt",
        folderId: MOUNT_ID,
        mimeType: "text/plain",
        sizeBytes: 1,
      })
    ).rejects.toBeInstanceOf(FileSourceReadOnlyError);
    await expect(
      composite.moveFile(ctx, "0f000000-0000-4000-8000-000000000000", MOUNT_ID)
    ).rejects.toBeInstanceOf(FileSourceReadOnlyError);
  });

  it("lets the mount row itself be renamed and removed (unmount)", async () => {
    const { composite, native } = build();
    await composite.renameFolder(ctx, MOUNT_ID, "New label");
    expect(native.renameFolder).toHaveBeenCalledWith(
      ctx,
      MOUNT_ID,
      "New label"
    );
    await composite.deleteFolder(ctx, MOUNT_ID);
    expect(native.deleteFolder).toHaveBeenCalledWith(ctx, MOUNT_ID);
  });
});
