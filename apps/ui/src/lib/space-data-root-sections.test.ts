import type { DriveNode } from "@engenty/file-storage";
import { describe, expect, it } from "vitest";
import {
  ARTIFACTS_SECTION_ID,
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

describe("groupSpaceDataRootSections", () => {
  it("turns each adapter root into a section and gathers artifacts", () => {
    const sections = groupSpaceDataRootSections(
      [
        folder("Contacts", "contacts"),
        folder("Files", "files"),
        {
          id: "artifact:a1",
          kind: "artifact",
          name: "Briefing",
          sourceId: "a1",
        },
      ],
      { artifacts: "Ablage" }
    );
    expect(sections.map((section) => `${section.id}:${section.label}`)).toEqual(
      [
        "data:contacts:Contacts",
        "data:files:Files",
        `${ARTIFACTS_SECTION_ID}:Ablage`,
      ]
    );
    expect(sections[2]?.children).toHaveLength(1);
    expect(sections[2]?.root).toBeNull();
  });

  it("mixes markdown pages and other artifact types under Artifacts", () => {
    const sections = groupSpaceDataRootSections(
      [
        {
          id: "artifact:md",
          kind: "artifact",
          name: "Notes",
          nodeType: "markdown",
          sourceId: "md",
        },
        {
          id: "artifact:html",
          kind: "artifact",
          name: "Report",
          nodeType: "html",
          sourceId: "html",
        },
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
      { artifacts: "Artifacts" }
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe(ARTIFACTS_SECTION_ID);
    expect(sections[0]?.children.map((node) => node.name)).toEqual([
      "Notes",
      "Report",
      "Briefs",
    ]);
  });

  it("always includes Artifacts so a page can be created without other roots", () => {
    const sections = groupSpaceDataRootSections([folder("Files", "files")], {
      artifacts: "Artifacts",
    });
    expect(sections.map((section) => section.id)).toEqual([
      "data:files",
      ARTIFACTS_SECTION_ID,
    ]);
    expect(sections[1]?.children).toEqual([]);
  });
});

describe("spaceDataSectionContainsSelection", () => {
  it("matches a path inside an adapter root", () => {
    const [contacts] = groupSpaceDataRootSections(
      [folder("Contacts", "contacts")],
      { artifacts: "Ablage" }
    );
    expect(
      spaceDataSectionContainsSelection(contacts!, {
        selectedPath: "Contacts/People",
      })
    ).toBe(true);
    expect(
      spaceDataSectionContainsSelection(contacts!, { selectedPath: "Files" })
    ).toBe(false);
  });

  it("treats the Artifacts root listing as inside that section", () => {
    const sections = groupSpaceDataRootSections([folder("Files", "files")], {
      artifacts: "Ablage",
    });
    const artifacts = sections.find(
      (section) => section.id === ARTIFACTS_SECTION_ID
    );
    expect(
      spaceDataSectionContainsSelection(artifacts!, { artifactsRoot: true })
    ).toBe(true);
    expect(spaceDataSectionContainsSelection(artifacts!, {})).toBe(false);
  });
});
