import type { DriveNode } from "@engenty/file-storage";
import { describe, expect, it } from "vitest";
import {
  APPS_SECTION_ID,
  ARTIFACTS_SECTION_ID,
  FILES_SECTION_ID,
  groupSpaceDataRootSections,
  spaceDataSectionContainsSelection,
} from "./space-data-root-sections";

const folder = (name: string, moduleId: string): DriveNode => ({
  dataPath: name,
  hasChildren: true,
  id: `data:${moduleId}`,
  kind: "folder",
  moduleId,
  name,
  sourceId: moduleId,
});

const artifact = (name: string, nodeType: string): DriveNode => ({
  id: `artifact:${name}`,
  kind: "artifact",
  name,
  nodeType,
  sourceId: name,
});

const labels = {
  apps: "Apps",
  artifacts: "Dokumente",
  files: "Dateien",
};

describe("groupSpaceDataRootSections", () => {
  it("orders Documents, Apps, Files, Shared, then the other modules", () => {
    const sections = groupSpaceDataRootSections(
      [
        folder("Contacts", "contacts"),
        folder("Public", "space-public"),
        folder("Files", "files"),
      ],
      labels
    );
    expect(sections.map((section) => section.id)).toEqual([
      ARTIFACTS_SECTION_ID,
      APPS_SECTION_ID,
      "data:files",
      "data:space-public",
      "data:contacts",
    ]);
  });

  it("lists the agents' folders inside Files, not as a section of their own", () => {
    const sections = groupSpaceDataRootSections(
      [folder("Files", "files"), folder("Agents", "space-agents")],
      labels
    );
    const files = sections.find((section) => section.id === "data:files");
    expect(files?.extra?.map((node) => node.dataPath)).toEqual(["Agents"]);
    expect(sections.some((section) => section.id === "data:space-agents")).toBe(
      false
    );
  });

  it("keeps a Files section for the agents' folders when the Space has no Files module", () => {
    const sections = groupSpaceDataRootSections(
      [folder("Agents", "space-agents")],
      labels
    );
    const files = sections.find((section) => section.id === FILES_SECTION_ID);
    expect(files?.label).toBe("Dateien");
    expect(files?.extra?.map((node) => node.dataPath)).toEqual(["Agents"]);
  });

  it("puts App artifacts under Apps and every other artifact under Documents", () => {
    const sections = groupSpaceDataRootSections(
      [
        artifact("Notes", "markdown"),
        artifact("Planner", "app"),
        artifact("Report", "html"),
        {
          children: [],
          hasChildren: true,
          id: "folder:f1",
          kind: "folder",
          name: "Briefs",
          nodeType: "folder",
          sourceId: "f1",
        },
      ],
      labels
    );
    const byId = new Map(sections.map((section) => [section.id, section]));
    expect(
      byId.get(ARTIFACTS_SECTION_ID)?.children.map((node) => node.name)
    ).toEqual(["Notes", "Report", "Briefs"]);
    expect(
      byId.get(APPS_SECTION_ID)?.children.map((node) => node.name)
    ).toEqual(["Planner"]);
  });

  it("returns Documents and Apps even when empty — the tree decides what to hide", () => {
    const sections = groupSpaceDataRootSections([], labels);
    expect(sections.map((section) => section.id)).toEqual([
      ARTIFACTS_SECTION_ID,
      APPS_SECTION_ID,
    ]);
  });
});

describe("spaceDataSectionContainsSelection", () => {
  it("matches a path inside an adapter root", () => {
    const contacts = groupSpaceDataRootSections(
      [folder("Contacts", "contacts")],
      labels
    ).find((section) => section.id === "data:contacts");
    expect(
      spaceDataSectionContainsSelection(contacts!, {
        selectedPath: "Contacts/People",
      })
    ).toBe(true);
    expect(
      spaceDataSectionContainsSelection(contacts!, { selectedPath: "Files" })
    ).toBe(false);
  });

  it("counts a path in the agents' folder as inside Files", () => {
    const [files] = groupSpaceDataRootSections(
      [folder("Agents", "space-agents")],
      labels
    ).filter((section) => section.id === FILES_SECTION_ID);
    expect(
      spaceDataSectionContainsSelection(files!, {
        selectedPath: "Agents/contacts.manager/uploads",
      })
    ).toBe(true);
  });

  it("counts the Documents root listing as inside Documents", () => {
    const [documents] = groupSpaceDataRootSections([], labels);
    expect(
      spaceDataSectionContainsSelection(documents!, { artifactsRoot: true })
    ).toBe(true);
    expect(spaceDataSectionContainsSelection(documents!, {})).toBe(false);
  });
});
