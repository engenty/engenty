import { describe, expect, it } from "vitest";
import {
  filesSpaceFileIdFromPath,
  isConnectedFolder,
  isFilesTreeFile,
} from "./connected-folder";
import {
  decodeConnectorNodeId,
  fileSpaceFactsFromNode,
  mergeFileSpaceFacts,
} from "./file-space-node-facts";

describe("decodeConnectorNodeId", () => {
  it("reads a file at the mount root (empty parent segment)", () => {
    const id = `cnx:3fa85f64-5717-4562-b3fc-2c963f66afa6:${btoa("index.md").replace(/=+$/, "")}:${btoa("").replace(/=+$/, "")}`;
    expect(decodeConnectorNodeId(id)).toEqual({
      connectionId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      parentRef: "",
      ref: "index.md",
    });
  });

  it("reads a nested provider path", () => {
    const id = `cnx:3fa85f64-5717-4562-b3fc-2c963f66afa6:${btoa("docs/readme.md").replace(/=+$/, "")}:${btoa("docs").replace(/=+$/, "")}`;
    expect(decodeConnectorNodeId(id)).toMatchObject({
      parentRef: "docs",
      ref: "docs/readme.md",
    });
  });

  it("returns null for a native uuid", () => {
    expect(
      decodeConnectorNodeId("3fa85f64-5717-4562-b3fc-2c963f66afa6")
    ).toBeNull();
  });
});

describe("fileSpaceFactsFromNode", () => {
  it("reads a mount's connection off the tree row", () => {
    expect(
      fileSpaceFactsFromNode({
        connectionId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        id: "data:files:Files/deploy",
        kind: "folder",
        name: "deploy",
        nodeType: "files.mount",
        sourceId: "Files/deploy",
      }).connectionId
    ).toBe("3fa85f64-5717-4562-b3fc-2c963f66afa6");
  });

  it("decodes a connected file's provider path from its cnx id", () => {
    const id = `cnx:3fa85f64-5717-4562-b3fc-2c963f66afa6:${btoa("index.md").replace(/=+$/, "")}:${btoa("").replace(/=+$/, "")}`;
    expect(
      fileSpaceFactsFromNode({
        id: `record:files:${id}`,
        kind: "record",
        mimeType: "text/markdown",
        moduleId: "files",
        name: "index.md",
        nodeType: "files.file",
        sizeBytes: 42,
        sourceId: id,
      })
    ).toMatchObject({
      connectionId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      mimeType: "text/markdown",
      originalRef: "index.md",
      sizeBytes: 42,
    });
  });

  it("keeps the tree row's facts when a listing walk finds nothing", () => {
    const base = fileSpaceFactsFromNode({
      connectionId: "cnx-1",
      id: "data:files:Files/deploy",
      kind: "folder",
      name: "deploy",
      nodeType: "files.mount",
      sourceId: "Files/deploy",
    });
    expect(mergeFileSpaceFacts(base, null).connectionId).toBe("cnx-1");
  });
});

describe("connected folder helpers", () => {
  it("recognises a files.mount folder", () => {
    expect(
      isConnectedFolder({
        id: "data:files:Files/engrd",
        kind: "folder",
        name: "engrd",
        nodeType: "files.mount",
        sourceId: "Files/engrd",
      })
    ).toBe(true);
    expect(
      isConnectedFolder({
        id: "data:files:Files/notes",
        kind: "folder",
        name: "notes",
        nodeType: "files.folder",
        sourceId: "Files/notes",
      })
    ).toBe(false);
  });

  it("treats a files.file record as a file", () => {
    expect(
      isFilesTreeFile({
        id: "record:files:abc",
        kind: "record",
        moduleId: "files",
        name: "index.md",
        nodeType: "files.file",
        sourceId: "abc",
      })
    ).toBe(true);
  });
});

describe("filesSpaceFileIdFromPath", () => {
  it("reads a native file id from a Files path", () => {
    expect(
      filesSpaceFileIdFromPath(
        "Files/notes__0f000000-0000-4000-8000-000000000001.md"
      )
    ).toBe("0f000000-0000-4000-8000-000000000001");
  });

  it("ignores folders and other modules", () => {
    expect(filesSpaceFileIdFromPath("Files/lmnd")).toBeNull();
    expect(
      filesSpaceFileIdFromPath(
        "Contacts/anna__0f000000-0000-4000-8000-000000000001.contact.md"
      )
    ).toBeNull();
  });
});
