import type { DriveNode } from "@engenty/file-storage";
import { describe, expect, it } from "vitest";
import { canDragDriveNode, canDropDriveNode } from "./drive-row-nest";

const page = (id: string, name = id): DriveNode => ({
  id: `artifact:${id}`,
  kind: "artifact",
  name,
  nodeType: "markdown",
  sourceId: id,
});

const artifactFolder = (id: string, children: DriveNode[] = []): DriveNode => ({
  children,
  hasChildren: true,
  id: `folder:${id}`,
  kind: "folder",
  name: id,
  nodeType: "folder",
  sourceId: id,
});

describe("canDropDriveNode", () => {
  it("allows dropping a page onto an artifact folder", () => {
    expect(canDropDriveNode(page("p"), artifactFolder("f"))).toBe(true);
  });

  it("refuses dropping a folder into itself or a descendant", () => {
    const child = artifactFolder("inner");
    const outer = artifactFolder("outer", [child]);
    expect(canDropDriveNode(outer, outer)).toBe(false);
    expect(canDropDriveNode(outer, child)).toBe(false);
  });

  it("refuses mixing artifacts with module folders", () => {
    const contactsFolder: DriveNode = {
      dataPath: "contacts/orgs",
      id: "data:contacts/orgs",
      kind: "folder",
      moduleId: "contacts",
      name: "orgs",
      sourceId: "contacts/orgs",
    };
    expect(canDropDriveNode(page("p"), contactsFolder)).toBe(false);
  });
});

describe("canDragDriveNode", () => {
  it("lets artifacts and nested data rows move", () => {
    expect(canDragDriveNode(page("p"))).toBe(true);
    expect(canDragDriveNode(artifactFolder("f"))).toBe(true);
    expect(
      canDragDriveNode({
        dataPath: "files/contracts",
        id: "data:files/contracts",
        kind: "folder",
        moduleId: "files",
        name: "contracts",
        sourceId: "files/contracts",
      })
    ).toBe(true);
  });

  it("keeps module roots planted", () => {
    expect(
      canDragDriveNode({
        dataPath: "files",
        id: "data:files",
        kind: "folder",
        moduleId: "files",
        name: "Files",
        sourceId: "files",
      })
    ).toBe(false);
  });
});
