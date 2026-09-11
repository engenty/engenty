import { describe, expect, it } from "vitest";
import type { AdminArtifactRow } from "../../artifacts/artifacts-api";
import {
  type ArtifactCatalogFilterState,
  filterAndSortArtifacts,
  getArtifactTypeValues,
  groupArtifacts,
} from "./artifacts-catalog-state";

function row(over: Partial<AdminArtifactRow>): AdminArtifactRow {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: null,
    created_by_kind: "agent",
    current_version: 1,
    id: "id",
    metadata: {},
    mime_type: null,
    scope_id: "scope",
    scope_type: "thread",
    size_bytes: null,
    status: "active",
    storage: "inline",
    storage_connection_id: null,
    storage_key: null,
    title: "Untitled",
    type: "markdown",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const baseState: ArtifactCatalogFilterState = {
  creator: "all",
  scope: "all",
  searchQuery: "",
  sortBy: "title",
  sortOrder: "asc",
  status: "all",
  storage: "all",
  typeFilter: "all",
};

describe("filterAndSortArtifacts", () => {
  const rows = [
    row({ id: "a", title: "Beta", scope_type: "task", type: "html" }),
    row({ id: "b", title: "Alpha", scope_type: "project", storage: "blob" }),
    row({
      id: "c",
      title: "Gamma",
      created_by_kind: "user",
      status: "archived",
    }),
  ];

  it("filters by scope", () => {
    const out = filterAndSortArtifacts(rows, { ...baseState, scope: "task" });
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  it("filters by type, storage, creator and status independently", () => {
    expect(
      filterAndSortArtifacts(rows, { ...baseState, typeFilter: "html" }).map(
        (r) => r.id
      )
    ).toEqual(["a"]);
    expect(
      filterAndSortArtifacts(rows, { ...baseState, storage: "blob" }).map(
        (r) => r.id
      )
    ).toEqual(["b"]);
    expect(
      filterAndSortArtifacts(rows, { ...baseState, creator: "user" }).map(
        (r) => r.id
      )
    ).toEqual(["c"]);
    expect(
      filterAndSortArtifacts(rows, { ...baseState, status: "archived" }).map(
        (r) => r.id
      )
    ).toEqual(["c"]);
  });

  it("searches across title and scope id", () => {
    expect(
      filterAndSortArtifacts(rows, { ...baseState, searchQuery: "alph" }).map(
        (r) => r.id
      )
    ).toEqual(["b"]);
  });

  it("sorts by title ascending and descending", () => {
    expect(
      filterAndSortArtifacts(rows, { ...baseState, sortOrder: "asc" }).map(
        (r) => r.title
      )
    ).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(
      filterAndSortArtifacts(rows, { ...baseState, sortOrder: "desc" }).map(
        (r) => r.title
      )
    ).toEqual(["Gamma", "Beta", "Alpha"]);
  });
});

describe("groupArtifacts", () => {
  const rows = [
    row({ id: "p", scope_type: "project" }),
    row({ id: "t", scope_type: "thread" }),
    row({ id: "k", scope_type: "task" }),
    row({ id: "s", scope_type: "space" }),
    row({ id: "a", scope_type: "agent" }),
  ];

  it("orders scope groups thread → task → project → space → agent", () => {
    expect(groupArtifacts(rows, "scope").map((g) => g.id)).toEqual([
      "thread",
      "task",
      "project",
      "space",
      "agent",
    ]);
  });

  it("returns a single group for 'none'", () => {
    const groups = groupArtifacts(rows, "none");
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(5);
  });

  it("returns no groups for an empty list", () => {
    expect(groupArtifacts([], "scope")).toEqual([]);
  });
});

describe("getArtifactTypeValues", () => {
  it("returns distinct sorted types", () => {
    expect(
      getArtifactTypeValues([
        row({ type: "table" }),
        row({ type: "markdown" }),
        row({ type: "markdown" }),
      ])
    ).toEqual(["markdown", "table"]);
  });
});
