import { describe, expect, it } from "vitest";
import {
  applyFolderList,
  type FolderChildRow,
  filterFolderRows,
  isFolderRowSelectable,
  pageFolderRows,
  partitionFolderBulkTargets,
  sortFolderRows,
} from "./folder-list-model";

function row(
  input: Partial<FolderChildRow> & Pick<FolderChildRow, "id" | "name">
): FolderChildRow {
  return {
    href: `/data?path=${input.name}`,
    kind: "record",
    ...input,
  };
}

describe("filterFolderRows", () => {
  it("matches name, subtitle, and kind", () => {
    const rows = [
      row({ id: "1", kind: "folder", name: "People" }),
      row({
        id: "2",
        name: "anna.contact.md",
        subtitle: "Anna Berger",
      }),
    ];
    expect(filterFolderRows(rows, "berger").map((entry) => entry.id)).toEqual([
      "2",
    ]);
    expect(filterFolderRows(rows, "folder").map((entry) => entry.id)).toEqual([
      "1",
    ]);
  });
});

describe("sortFolderRows", () => {
  it("sorts missing dates first when ascending", () => {
    const rows = [
      row({ id: "a", name: "a", updatedAt: "2026-01-02T00:00:00.000Z" }),
      row({ id: "b", name: "b" }),
      row({ id: "c", name: "c", updatedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(
      sortFolderRows(rows, "updatedAt", "asc").map((entry) => entry.id)
    ).toEqual(["b", "c", "a"]);
  });
});

describe("pageFolderRows", () => {
  it("clamps a page past the end", () => {
    const rows = [1, 2, 3];
    expect(pageFolderRows(rows, 9, 2)).toEqual({
      page: 2,
      rows: [3],
      total: 3,
      totalPages: 2,
    });
  });
});

describe("isFolderRowSelectable", () => {
  it("selects artifacts and nested data paths, not module roots", () => {
    expect(
      isFolderRowSelectable(
        row({
          id: "artifact:a1",
          kind: "artifact",
          name: "Briefing",
          sourceId: "a1",
        })
      )
    ).toBe(true);
    expect(
      isFolderRowSelectable(
        row({
          dataPath: "Contacts",
          id: "folder:Contacts",
          kind: "folder",
          name: "Contacts",
        })
      )
    ).toBe(false);
    expect(
      isFolderRowSelectable(
        row({
          dataPath: "Contacts/People",
          id: "folder:Contacts/People",
          kind: "folder",
          name: "People",
        })
      )
    ).toBe(true);
  });
});

describe("partitionFolderBulkTargets", () => {
  it("archives artifacts and deletes nested data paths once", () => {
    const rows = [
      row({
        id: "artifact:a1",
        kind: "artifact",
        name: "Briefing",
        sourceId: "a1",
      }),
      row({
        dataPath: "Offers/draft",
        id: "folder:Offers/draft",
        kind: "folder",
        name: "draft",
      }),
      row({
        dataPath: "Offers/draft/one",
        id: "record:one",
        kind: "record",
        name: "one",
      }),
      row({
        dataPath: "Contacts",
        id: "folder:Contacts",
        kind: "folder",
        name: "Contacts",
      }),
    ];
    expect(
      partitionFolderBulkTargets(
        rows,
        new Set([
          "artifact:a1",
          "folder:Offers/draft",
          "record:one",
          "folder:Contacts",
        ])
      )
    ).toEqual({
      artifactIds: ["a1"],
      dataNodes: [{ path: "Offers/draft", recursive: true }],
    });
  });
});

describe("applyFolderList", () => {
  it("filters then sorts then pages", () => {
    const rows = [
      row({ id: "1", name: "Zed" }),
      row({ id: "2", name: "Ann" }),
      row({ id: "3", name: "Abe" }),
    ];
    const result = applyFolderList(rows, {
      page: 1,
      pageSize: 1,
      search: "a",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(result.total).toBe(2);
    expect(result.rows.map((entry) => entry.id)).toEqual(["3"]);
  });
});
