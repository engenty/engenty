import type { SpaceDriveFolder } from "@engenty/file-storage";
import { describe, expect, it } from "vitest";
import {
  isConnectedDriveFolder,
  selectSpaceHomeConnectedFolders,
  selectSpaceHomeListedFiles,
  takeDroppedFiles,
} from "./space-home-files";

const folder = (
  overrides: Partial<SpaceDriveFolder> & Pick<SpaceDriveFolder, "id" | "name">
): SpaceDriveFolder => ({
  parentId: null,
  ...overrides,
});

describe("selectSpaceHomeConnectedFolders", () => {
  it("keeps mounts and drops native folders", () => {
    const rows = selectSpaceHomeConnectedFolders([
      folder({ id: "n", name: "Notes", source: "native" }),
      folder({
        connectionId: "conn-1",
        id: "g",
        name: "Drive",
        source: "gdrive",
      }),
      folder({ id: "b", name: "Box", source: "box" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["b", "g"]);
  });

  it("sorts by the name a person reads", () => {
    const rows = selectSpaceHomeConnectedFolders([
      folder({ connectionId: "2", id: "2", name: "Zeta" }),
      folder({ connectionId: "1", id: "1", name: "Alpha" }),
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("isConnectedDriveFolder", () => {
  it("treats a connection id as a mount even when source is native", () => {
    expect(
      isConnectedDriveFolder(
        folder({ connectionId: "c", id: "m", name: "M", source: "native" })
      )
    ).toBe(true);
  });
});

describe("selectSpaceHomeListedFiles", () => {
  it("sorts files newest first", () => {
    const rows = selectSpaceHomeListedFiles([
      { folderId: null, id: "old", name: "a.txt", updatedAt: "2026-01-01" },
      { folderId: null, id: "new", name: "z.txt", updatedAt: "2026-09-01" },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
  });
});

describe("takeDroppedFiles", () => {
  it("copies a FileList before a later reset can empty it", () => {
    const file = new File(["ok"], "note.txt", { type: "text/plain" });
    const live = {
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
      *[Symbol.iterator]() {
        yield file;
      },
    } as unknown as FileList;
    const copied = takeDroppedFiles(live);
    const emptied = live as unknown as { 0?: File; length: number };
    emptied[0] = undefined;
    emptied.length = 0;
    expect(copied).toEqual([file]);
    expect(takeDroppedFiles(live)).toEqual([]);
  });
});
