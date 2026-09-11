import { describe, expect, it } from "vitest";
import {
  collectFileStorageExplorerIds,
  fileStorageExplorerPathLabel,
  fileStorageExplorerSegments,
  isNativeFileSpaceObjectKey,
  labelFileStorageExplorerSegments,
  overlayExplorerFolderName,
  spaceIdFromFileStorageExplorerPath,
} from "./explorer-labels.js";
import { fileStorageSpaceObjectKey } from "./internal-storage-path.js";

const TID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SID = "019fe917-2c4d-75e0-a3b5-f25c46b2c706";
const ENTRY = "0ce2b852-4040-41a0-89f7-01ca644b87f4";

describe("spaceIdFromFileStorageExplorerPath", () => {
  it("reads the space id from an absolute key and a tenant-relative prefix", () => {
    expect(
      spaceIdFromFileStorageExplorerPath(
        fileStorageSpaceObjectKey(TID, SID, "files", ENTRY)
      )
    ).toBe(SID);
    expect(spaceIdFromFileStorageExplorerPath(`spaces/${SID}/files/`)).toBe(
      SID
    );
  });

  it("ignores tenant-level paths and non-uuid folders", () => {
    expect(
      spaceIdFromFileStorageExplorerPath(`tenants/${TID}/inbox/a.pdf`)
    ).toBeNull();
    expect(spaceIdFromFileStorageExplorerPath("spaces/not-a-uuid/files")).toBe(
      null
    );
  });
});

describe("isNativeFileSpaceObjectKey", () => {
  it("matches a space-owned file-space blob whose leaf is the entry id", () => {
    expect(
      isNativeFileSpaceObjectKey(
        fileStorageSpaceObjectKey(TID, SID, "files", ENTRY)
      )
    ).toBe(true);
  });

  it("rejects project-owned keys, named blobs, and other modules", () => {
    expect(
      isNativeFileSpaceObjectKey(
        fileStorageSpaceObjectKey(TID, SID, "files", "project", "p1", ENTRY)
      )
    ).toBe(false);
    expect(
      isNativeFileSpaceObjectKey(
        fileStorageSpaceObjectKey(TID, SID, "files", "brief.pdf")
      )
    ).toBe(false);
    expect(
      isNativeFileSpaceObjectKey(
        fileStorageSpaceObjectKey(TID, SID, "ai", "workspace", "commons")
      )
    ).toBe(false);
  });
});

describe("collectFileStorageExplorerIds", () => {
  it("collects space ids from prefixes and native file keys", () => {
    const key = fileStorageSpaceObjectKey(TID, SID, "files", ENTRY);
    expect(
      collectFileStorageExplorerIds({
        keys: [key],
        prefixes: [`spaces/${SID}/`, "ai/"],
      })
    ).toEqual({
      fileKeys: [key],
      spaceIds: [SID],
    });
  });

  it("does not treat an ai workspace uuid as a file-space blob", () => {
    const taskKey = fileStorageSpaceObjectKey(
      TID,
      SID,
      "ai",
      "workspace",
      "tasks",
      ENTRY
    );
    expect(collectFileStorageExplorerIds({ keys: [taskKey] })).toEqual({
      fileKeys: [],
      spaceIds: [SID],
    });
  });
});

describe("labelFileStorageExplorerSegments", () => {
  it("substitutes known uuids and leaves other segments", () => {
    expect(
      labelFileStorageExplorerSegments(["spaces", SID, "files", ENTRY], {
        [SID]: "Haushalt",
        [ENTRY]: "mietvertrag.pdf",
      })
    ).toEqual(["spaces", "Haushalt", "files", "mietvertrag.pdf"]);
  });
});

describe("fileStorageExplorerPathLabel", () => {
  it("replaces the space id in the inspector path label", () => {
    expect(
      fileStorageExplorerPathLabel(
        fileStorageSpaceObjectKey(TID, SID, "files", ENTRY),
        { [SID]: "Haushalt" }
      )
    ).toBe("spaces › Haushalt › files");
  });

  it("keeps the knowledge-base slug label", () => {
    expect(
      fileStorageExplorerPathLabel(
        `tenants/${TID}/knowledge-base/my-kb/doc.pdf`,
        {}
      )
    ).toBe("knowledge-base › my-kb");
  });
});

describe("overlayExplorerFolderName", () => {
  it("keeps the uuid prefix and shows the space name", () => {
    expect(
      overlayExplorerFolderName(
        { name: SID, prefix: `spaces/${SID}/` },
        { [SID]: "Haushalt" },
        { [SID]: "Haushalt (haushalt)" }
      )
    ).toEqual({
      name: "Haushalt",
      prefix: `spaces/${SID}/`,
      title: "Haushalt (haushalt)",
    });
  });

  it("leaves unrelated folders alone", () => {
    expect(
      overlayExplorerFolderName(
        { name: "files", prefix: `spaces/${SID}/files/` },
        {
          [SID]: "Haushalt",
        }
      )
    ).toEqual({ name: "files", prefix: `spaces/${SID}/files/` });
  });
});

describe("fileStorageExplorerSegments", () => {
  it("strips tenants/<id>/ from an absolute key", () => {
    expect(
      fileStorageExplorerSegments(
        fileStorageSpaceObjectKey(TID, SID, "files", ENTRY)
      )
    ).toEqual(["spaces", SID, "files", ENTRY]);
  });
});
