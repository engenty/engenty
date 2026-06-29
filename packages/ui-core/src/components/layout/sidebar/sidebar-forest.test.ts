import { describe, expect, it } from "vitest";
import {
  capSidebarForest,
  filterSidebarForest,
  type SidebarForest,
  sidebarForestSome,
} from "./sidebar-forest";

function sampleForest(): SidebarForest<{ id: string; title: string }>[] {
  return [
    {
      item: { id: "a", title: "Alpha" },
      children: [
        {
          item: { id: "b", title: "Beta child" },
          children: [],
        },
      ],
    },
    { item: { id: "c", title: "Gamma notes" }, children: [] },
  ];
}

describe("filterSidebarForest", () => {
  it("returns forest unchanged when query is empty", () => {
    const f = sampleForest();
    expect(filterSidebarForest(f, "", () => false)).toEqual(f);
  });

  it("keeps matching nodes and ancestors of matches", () => {
    const out = filterSidebarForest(sampleForest(), "beta", (item, q) =>
      item.title.toLowerCase().includes(q)
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.item.id).toBe("a");
    expect(out[0]?.children).toHaveLength(1);
    expect(out[0]?.children[0]?.item.id).toBe("b");
  });

  it("matches leaf nodes without keeping unrelated siblings", () => {
    const out = filterSidebarForest(sampleForest(), "notes", (item, q) =>
      item.title.toLowerCase().includes(q)
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.item.id).toBe("c");
  });
});

describe("capSidebarForest", () => {
  it("limits siblings at each level", () => {
    const f = sampleForest();
    const out = capSidebarForest(f, 1);
    expect(out).toHaveLength(1);
    expect(out[0]?.item.id).toBe("a");
    expect(out[0]?.children).toHaveLength(1);
  });

  it("returns empty when max is zero", () => {
    expect(capSidebarForest(sampleForest(), 0)).toEqual([]);
  });
});

describe("sidebarForestSome", () => {
  it("finds nested matches", () => {
    expect(sidebarForestSome(sampleForest(), (item) => item.id === "b")).toBe(
      true
    );
  });

  it("returns false when no match", () => {
    expect(sidebarForestSome(sampleForest(), (item) => item.id === "z")).toBe(
      false
    );
  });
});
