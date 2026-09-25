/**
 * Remote folders as WRITE targets (PLAN-space-data-agent-crud P2.2).
 *
 * The properties worth pinning are the refusals, not the happy paths: a mount
 * whose connector declares no `storage` must stay read-only rather than fail at
 * the provider, folder verbs must refuse by NAME because the capability has
 * none, and a file whose position is unknown must refuse rather than guess a
 * destination and relocate somebody's document.
 */
import type { FileSourceContext } from "@engenty/file-storage";
import { FileSourceReadOnlyError } from "@engenty/file-storage";
import { describe, expect, it, vi } from "vitest";
import {
  type ConnectorMountRow,
  createConnectorFileSource,
} from "./connector-file-source.js";
import {
  decodeConnectorNodeId,
  encodeConnectorNodeId,
} from "./connector-ref.js";

/** The file space may use every connection in these tests. */
const allowConnection = async () => undefined;

const ctx: FileSourceContext = {
  owner: { id: "space-1", type: "space" },
  principalId: "user-1",
  tenantId: "tenant-1",
};

const MOUNT_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const CONNECTION_ID = "9b2f1c44-0000-4000-8000-000000000001";

const mountRow: ConnectorMountRow = {
  connectionId: CONNECTION_ID,
  createdAt: "2026-07-01T00:00:00Z",
  id: MOUNT_ID,
  name: "Bucket",
  parentId: null,
  source: "s3",
  sourceFolderId: "prefix",
  updatedAt: "2026-07-01T00:00:00Z",
};

const entry = {
  kind: "file" as const,
  mime_type: "text/plain",
  modified_at: "2026-08-01T00:00:00Z",
  name: "notes.txt",
  ref: "prefix/notes.txt",
  size: 12,
};

function build(options?: { storageCapable?: boolean; writable?: boolean }) {
  const client = {
    filesDelete: vi.fn(async () => ({ deleted: true, ref: entry.ref })),
    filesList: vi.fn(async () => ({
      entries: [entry],
      next_cursor: null,
    })),
    filesMove: vi.fn(async () => entry),
    filesRead: vi.fn(async () => ({
      expires_at: null,
      kind: "url" as const,
      mime_type: null,
      name: null,
      size: null,
      url: "https://x",
    })),
    filesStat: vi.fn(async () => entry),
    filesWrite: vi.fn(async () => entry),
    isStorageCapable: vi.fn(async () => options?.storageCapable ?? true),
  };
  const source = createConnectorFileSource({
    assertConnectionUsable: allowConnection,
    client:
      options?.writable === false
        ? {
            ...client,
            filesWrite: undefined,
            filesMove: undefined,
            filesDelete: undefined,
          }
        : client,
    getMount: vi.fn(async (_c, id) => (id === MOUNT_ID ? mountRow : null)),
  });
  return { client, source };
}

const fileId = encodeConnectorNodeId(CONNECTION_ID, entry.ref, "prefix");

describe("capability is negotiated, not attempted", () => {
  it("renders a storage-less connection as read-only", async () => {
    // A mount that offers an action which will fail teaches callers to retry.
    const { source } = build({ storageCapable: false });
    const listing = await source.listFolder(ctx, MOUNT_ID);
    expect(listing.readOnly).toBe(true);
    expect(listing.files[0]?.readOnly).toBe(true);
  });

  it("renders a storage-capable connection as writable", async () => {
    const { source } = build({ storageCapable: true });
    const listing = await source.listFolder(ctx, MOUNT_ID);
    expect(listing.readOnly).toBe(false);
    expect(listing.files[0]?.readOnly).toBe(false);
  });

  it("answers read-only when the client cannot even be asked", async () => {
    // No `isStorageCapable` ⇒ not writable, which is the safe direction.
    const source = createConnectorFileSource({
      assertConnectionUsable: allowConnection,
      client: {
        filesList: vi.fn(async () => ({ entries: [entry], next_cursor: null })),
        filesRead: vi.fn(async () => ({
          expires_at: null,
          kind: "url" as const,
          mime_type: null,
          name: null,
          size: null,
          url: "https://x",
        })),
      },
      getMount: vi.fn(async () => mountRow),
    });
    expect((await source.listFolder(ctx, MOUNT_ID)).readOnly).toBe(true);
  });
});

describe("file writes reach the connector's storage capability", () => {
  it("deletes through files_delete", async () => {
    const { client, source } = build();
    await source.deleteFile(ctx, fileId);
    expect(client.filesDelete).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: CONNECTION_ID, ref: entry.ref })
    );
  });

  it("renames by moving to the SAME parent under a new name", async () => {
    const { client, source } = build();
    await source.renameFile(ctx, fileId, "neu.txt");
    expect(client.filesMove).toHaveBeenCalledWith(
      expect.objectContaining({
        newName: "neu.txt",
        ref: entry.ref,
        toFolderRef: "prefix",
      })
    );
  });

  it("saves an edit by writing folder + name, taking the name from a stat", async () => {
    const { client, source } = build();
    await source.replaceContent(ctx, fileId, {
      data: new TextEncoder().encode("hallo"),
      expectedUpdatedAt: entry.modified_at,
    });
    expect(client.filesStat).toHaveBeenCalled();
    expect(client.filesWrite).toHaveBeenCalledWith(
      expect.objectContaining({ folderRef: "prefix", name: "notes.txt" })
    );
  });

  it("saves a file at the mount root with folder_ref null", async () => {
    const rootMount = { ...mountRow, sourceFolderId: null };
    const rootEntry = { ...entry, name: "index.md", ref: "index.md" };
    const client = {
      filesList: vi.fn(async () => ({
        entries: [rootEntry],
        next_cursor: null,
      })),
      filesRead: vi.fn(),
      filesStat: vi.fn(async () => rootEntry),
      filesWrite: vi.fn(async () => rootEntry),
      isStorageCapable: vi.fn(async () => true),
    };
    const source = createConnectorFileSource({
      assertConnectionUsable: allowConnection,
      client,
      getMount: vi.fn(async (_c, id) => (id === MOUNT_ID ? rootMount : null)),
    });
    const listing = await source.listFolder(ctx, MOUNT_ID);
    const listed = listing.files[0];
    expect(listed).toBeDefined();
    expect(decodeConnectorNodeId(listed?.id ?? "")?.parentRef).toBe("");
    await source.replaceContent(ctx, listed?.id ?? "", {
      data: new TextEncoder().encode("# hi"),
      expectedUpdatedAt: rootEntry.modified_at,
    });
    expect(client.filesWrite).toHaveBeenCalledWith(
      expect.objectContaining({ folderRef: null, name: "index.md" })
    );
  });
});

describe("what it refuses, and why", () => {
  it("refuses every FOLDER verb by name — the capability has none", async () => {
    const { source } = build();
    for (const call of [
      () => source.createFolder(ctx, MOUNT_ID, "neu"),
      () => source.renameFolder(ctx, MOUNT_ID, "neu"),
      () => source.moveFolder(ctx, MOUNT_ID, null),
      () => source.deleteFolder(ctx, MOUNT_ID),
    ]) {
      await expect(call()).rejects.toThrow(/not part of the connector/);
    }
  });

  it("refuses a rename when the file's position is unknown", async () => {
    // An id minted before parents were carried. Guessing the provider root
    // would RELOCATE the file, which is worse than refusing.
    const { source } = build();
    const legacyId = encodeConnectorNodeId(CONNECTION_ID, entry.ref);
    await expect(source.renameFile(ctx, legacyId, "neu.txt")).rejects.toThrow(
      /position .* is not known/
    );
  });

  it("refuses to move a file into another connection's mount", async () => {
    // A move across accounts would silently be a copy-and-delete over a trust
    // boundary; the provider only moves within itself.
    const { source } = build();
    const otherMount = encodeConnectorNodeId(
      "0000ffff-0000-4000-8000-000000000002",
      "other",
      null
    );
    await expect(source.moveFile(ctx, fileId, otherMount)).rejects.toThrow(
      /inside its own connection/
    );
  });

  it("still throws read-only when the connector declares no storage at all", async () => {
    const { source } = build({ writable: false });
    await expect(source.deleteFile(ctx, fileId)).rejects.toBeInstanceOf(
      FileSourceReadOnlyError
    );
  });
});

describe("connector listing mime", () => {
  it("guesses JSON from the filename when the connector sends no mime", async () => {
    const source = createConnectorFileSource({
      assertConnectionUsable: allowConnection,
      client: {
        filesList: vi.fn(async () => ({
          entries: [
            {
              kind: "file" as const,
              mime_type: null,
              modified_at: "2026-08-01T00:00:00Z",
              name: "channels.json",
              ref: ".chat/channels.json",
              size: 120,
            },
          ],
          next_cursor: null,
        })),
        filesRead: vi.fn(),
      },
      getMount: vi.fn(async () => mountRow),
    });
    const listing = await source.listFolder(ctx, MOUNT_ID);
    expect(listing.files[0]?.mimeType).toBe("application/json");
  });
});
