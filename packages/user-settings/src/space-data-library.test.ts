import { describe, expect, it } from "vitest";
import {
  emptySpaceDataLibraryDocument,
  parseSpaceDataLibraryDocument,
  spaceDataRecentForSpace,
  touchSpaceDataRecent,
} from "./space-data-library.js";

const FOLDER = {
  href: "/s/company/data?folder=abc&fs=space:1",
  kind: "folder" as const,
  space_id: "space-1",
  title: "Ordner Zwei",
};

describe("space data library", () => {
  it("moves a touched item to the front of Recent for its space", () => {
    let doc = emptySpaceDataLibraryDocument();
    doc = touchSpaceDataRecent(doc, { ...FOLDER, title: "Older" });
    doc = touchSpaceDataRecent(doc, {
      href: "/s/company/data?file=f1&fs=space:1",
      kind: "file",
      space_id: "space-1",
      title: "brief.pdf",
    });
    doc = touchSpaceDataRecent(doc, FOLDER);
    expect(
      spaceDataRecentForSpace(doc, "space-1").map((item) => item.title)
    ).toEqual(["Ordner Zwei", "brief.pdf"]);
  });

  it("keeps another space's recents when this space's list is capped", () => {
    let doc = emptySpaceDataLibraryDocument();
    doc = touchSpaceDataRecent(doc, {
      href: "/other",
      kind: "file",
      space_id: "space-2",
      title: "Keep me",
    });
    for (let index = 0; index < 25; index += 1) {
      doc = touchSpaceDataRecent(doc, {
        href: `/s/company/data?file=${index}&fs=space:1`,
        kind: "file",
        space_id: "space-1",
        title: `File ${index}`,
      });
    }
    expect(spaceDataRecentForSpace(doc, "space-1")).toHaveLength(20);
    expect(spaceDataRecentForSpace(doc, "space-2")).toHaveLength(1);
  });

  it("ignores a leftover starred key from an earlier document shape", () => {
    const parsed = parseSpaceDataLibraryDocument({
      recent: [
        {
          href: FOLDER.href,
          kind: FOLDER.kind,
          space_id: FOLDER.space_id,
          title: FOLDER.title,
          touched_at: "2026-09-10T00:00:00.000Z",
        },
      ],
      starred: [
        {
          href: "/s/company/data?artifact=old",
          kind: "artifact",
          space_id: "space-1",
          title: "Old pin",
          touched_at: "2026-09-01T00:00:00.000Z",
        },
      ],
      v: 1,
    });
    expect(parsed).toEqual({
      recent: [
        {
          href: FOLDER.href,
          kind: FOLDER.kind,
          space_id: FOLDER.space_id,
          title: FOLDER.title,
          touched_at: "2026-09-10T00:00:00.000Z",
        },
      ],
      v: 1,
    });
    expect(parsed).not.toHaveProperty("starred");
  });

  it("degrades an unreadable doc to null rather than throwing", () => {
    expect(parseSpaceDataLibraryDocument({ v: 2 })).toBeNull();
    expect(parseSpaceDataLibraryDocument("nope")).toBeNull();
  });
});
