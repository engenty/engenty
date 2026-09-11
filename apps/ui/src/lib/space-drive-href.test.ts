import { spaceDriveRootOwner } from "@engenty/file-storage";
import { describe, expect, it } from "vitest";
import { driveNodeHref, driveNodeToListRow } from "./space-drive-href";

const SPACE = "019fe871-f780-78ee-9232-20b4c84665de";

describe("driveNodeHref", () => {
  it("addresses a native file-space folder the way the tree click does", () => {
    expect(
      driveNodeHref("company", {
        id: "folder:abc",
        kind: "folder",
        name: "Ordner Zwei",
        owner: spaceDriveRootOwner(SPACE),
        sourceId: "abc",
      })
    ).toBe(`/s/company/data?folder=abc&fs=space%3A${SPACE}`);
  });

  it("addresses a module folder by its data path", () => {
    expect(
      driveNodeHref("company", {
        dataPath: "Contacts",
        id: "data:contacts",
        kind: "folder",
        name: "Contacts",
        sourceId: "contacts",
      })
    ).toBe("/s/company/data?as=folder&path=Contacts");
  });

  it("addresses an artifact folder like any other artifact", () => {
    expect(
      driveNodeHref("company", {
        hasChildren: true,
        id: "folder:f1",
        kind: "folder",
        name: "Briefs",
        nodeType: "folder",
        sourceId: "f1",
      })
    ).toBe("/s/company/data?artifact=f1");
  });

  it("maps a listed artifact to an admin-list row", () => {
    expect(
      driveNodeToListRow("company", {
        id: "artifact:a1",
        kind: "artifact",
        name: "Briefing",
        nodeType: "markdown",
        sourceId: "a1",
        updatedAt: "2026-09-10T00:00:00.000Z",
      })
    ).toEqual({
      href: "/s/company/data?artifact=a1",
      id: "artifact:a1",
      kind: "artifact",
      name: "Briefing",
      nodeType: "markdown",
      sourceId: "a1",
      updatedAt: "2026-09-10T00:00:00.000Z",
    });
  });
});
