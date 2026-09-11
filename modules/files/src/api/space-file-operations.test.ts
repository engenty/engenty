import type { FileSource } from "@engenty/file-storage";
import type {
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { encodeConnectorNodeId } from "../sources/connector-ref.js";
import {
  registerSpaceFileOperations,
  spaceFileReadPresentation,
} from "./space-file-operations.js";

function collectOperations() {
  const operations: PluginServerOperation[] = [];
  const api = {
    registerOperation: (operation: PluginServerOperation) => {
      operations.push(operation);
    },
  } as Pick<PluginServerApi, "registerOperation">;
  return { api, operations };
}

describe("space file operations spacePolicy", () => {
  it("classifies collection ops as space_owned without a record lookup", () => {
    const { api, operations } = collectOperations();
    registerSpaceFileOperations(api as PluginServerApi, {} as FileSource);

    expect(
      operations.find((op) => op.operationId === "files_space_list")
        ?.spacePolicy
    ).toEqual({ kind: "space_owned", spaceInputKey: "space_id" });
    expect(
      operations.find((op) => op.operationId === "files_space_folder_create")
        ?.spacePolicy
    ).toEqual({ kind: "space_owned", spaceInputKey: "space_id" });
  });

  it("resolves file and folder rows through the files Space lookup", () => {
    const { api, operations } = collectOperations();
    registerSpaceFileOperations(api as PluginServerApi, {} as FileSource);

    const byId = Object.fromEntries(
      operations.map((op) => [op.operationId, op.spacePolicy])
    );
    expect(byId.files_space_read).toEqual({
      kind: "space_owned",
      spaceInputKey: "space_id",
    });
    expect(byId.files_space_write).toEqual(byId.files_space_read);
    expect(byId.files_space_file_delete).toEqual(byId.files_space_read);
    expect(byId.files_space_file_move).toEqual(byId.files_space_read);
    expect(byId.files_space_folder_move).toEqual({
      kind: "space_owned",
      record: { idInputKey: "folder_id", moduleId: "files" },
      spaceInputKey: "space_id",
    });
    expect(byId.files_space_folder_delete).toEqual(
      byId.files_space_folder_move
    );
    expect(
      operations.every((op) => op.spacePolicy?.kind === "space_owned")
    ).toBe(true);
  });
});

describe("spaceFileReadPresentation", () => {
  it("treats a connected .json file with no mime as utf-8 JSON, not Base64", () => {
    expect(
      spaceFileReadPresentation({
        mimeType: "application/octet-stream",
        name: "channels.json",
      })
    ).toEqual({ encoding: "utf8", mimeType: "application/json" });
  });

  it("keeps a provider mime when one was sent", () => {
    expect(
      spaceFileReadPresentation({
        mimeType: "image/png",
        name: "diagram.json",
      })
    ).toEqual({ encoding: "base64", mimeType: "image/png" });
  });

  it("keeps unknown binaries as Base64", () => {
    expect(
      spaceFileReadPresentation({
        mimeType: "application/octet-stream",
        name: "blob.bin",
      })
    ).toEqual({ encoding: "base64", mimeType: "application/octet-stream" });
  });
});

describe("files_space_write input", () => {
  it("accepts a virtual connector file id, not only a uuid", () => {
    const { api, operations } = collectOperations();
    registerSpaceFileOperations(api as PluginServerApi, {} as FileSource);
    const write = operations.find(
      (op) => op.operationId === "files_space_write"
    );
    const fileId = encodeConnectorNodeId(
      "9b2f1c44-0000-4000-8000-000000000001",
      "index.md",
      ""
    );
    expect(
      write?.inputSchema?.parse({
        content: "# hi",
        expected_version: "2026-08-01T00:00:00Z",
        file_id: fileId,
        space_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      })
    ).toMatchObject({ file_id: fileId });
  });
});

describe("files_space_read locate", () => {
  const spaceId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
  const ctx = {
    auth: { principalId: "user-1", tenantId: "tenant-1" },
  };

  function readHandler(source: FileSource) {
    const { api, operations } = collectOperations();
    registerSpaceFileOperations(api as PluginServerApi, source);
    const read = operations.find((op) => op.operationId === "files_space_read");
    if (!read) {
      throw new Error("files_space_read missing");
    }
    return read;
  }

  it("does not walk the tree for a connected file", async () => {
    const listFolder = vi.fn(async () => ({ files: [], folders: [] }));
    const readBytes = vi.fn(async () => new TextEncoder().encode("# hi"));
    const source = {
      listFolder,
      readBytes,
    } as unknown as FileSource;
    const fileId = encodeConnectorNodeId(
      "9b2f1c44-0000-4000-8000-000000000001",
      "docs/readme.md",
      "docs"
    );
    const read = readHandler(source);
    const result = (await read.handler(
      { file_id: fileId, space_id: spaceId },
      ctx as never
    )) as { encoding: string; file: { mimeType: string; name: string } };
    expect(listFolder).not.toHaveBeenCalled();
    expect(readBytes).toHaveBeenCalledTimes(1);
    expect(result.encoding).toBe("utf8");
    expect(result.file).toMatchObject({
      mimeType: "text/markdown",
      name: "readme.md",
    });
  });

  it("does not recurse into connected folders looking for a native file", async () => {
    const nativeId = "0f000000-0000-4000-8000-000000000001";
    const listed = new Set<string | null>();
    const source = {
      listFolder: vi.fn(async (_ctx, folderId: string | null) => {
        listed.add(folderId);
        if (folderId === null) {
          return {
            files: [],
            folders: [
              {
                connectionId: "9b2f1c44-0000-4000-8000-000000000001",
                createdAt: "",
                id: "aaaaaaaa-0000-4000-8000-000000000001",
                name: "deploy",
                parentId: null,
                source: "local",
                updatedAt: "",
              },
              {
                createdAt: "",
                id: "bbbbbbbb-0000-4000-8000-000000000001",
                name: "Notes",
                parentId: null,
                source: "native",
                updatedAt: "",
              },
            ],
          };
        }
        if (folderId === "bbbbbbbb-0000-4000-8000-000000000001") {
          return {
            files: [
              {
                createdAt: "",
                folderId,
                id: nativeId,
                mimeType: "text/plain",
                name: "todo.txt",
                sizeBytes: 2,
                source: "native",
                updatedAt: "",
              },
            ],
            folders: [],
          };
        }
        throw new Error(`unexpected list of ${folderId}`);
      }),
      readBytes: vi.fn(async () => new TextEncoder().encode("ok")),
    } as unknown as FileSource;
    const read = readHandler(source);
    await read.handler({ file_id: nativeId, space_id: spaceId }, ctx as never);
    expect(listed.has("aaaaaaaa-0000-4000-8000-000000000001")).toBe(false);
    expect(listed.has("bbbbbbbb-0000-4000-8000-000000000001")).toBe(true);
  });
});
