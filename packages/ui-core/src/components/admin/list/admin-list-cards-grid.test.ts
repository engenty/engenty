import { describe, expect, it } from "vitest";
import { adminListCardsGridClassName } from "./admin-list-cards-grid.js";

describe("adminListCardsGridClassName", () => {
  it("uses a tighter min track and gap for compact density", () => {
    expect(adminListCardsGridClassName("compact")).toContain(
      "repeat(auto-fill,minmax(min(100%,20rem),1fr))"
    );
    expect(adminListCardsGridClassName("compact")).toContain("gap-2");
  });

  it("uses a wider min track and gap for normal density", () => {
    expect(adminListCardsGridClassName("normal")).toContain(
      "repeat(auto-fill,minmax(min(100%,18rem),1fr))"
    );
    expect(adminListCardsGridClassName("normal")).toContain("gap-3");
  });

  it("defaults to normal density", () => {
    expect(adminListCardsGridClassName()).toBe(
      adminListCardsGridClassName("normal")
    );
  });

  it("widens the track for prose-led catalogs, at either density", () => {
    for (const size of ["compact", "normal"] as const) {
      expect(adminListCardsGridClassName(size, { track: "wide" })).toContain(
        "repeat(auto-fill,minmax(min(100%,26rem),1fr))"
      );
    }
    // Density still drives the gap — only the track changes.
    expect(adminListCardsGridClassName("compact", { track: "wide" })).toContain(
      "gap-2"
    );
  });

  it("emits literal track classes so Tailwind can scan them", () => {
    // A runtime-assembled arbitrary value compiles to no CSS and the grid
    // silently collapses to a single column.
    for (const value of Object.values({
      a: adminListCardsGridClassName("compact"),
      b: adminListCardsGridClassName("normal"),
      c: adminListCardsGridClassName("normal", { track: "wide" }),
    })) {
      expect(value).not.toContain("${");
    }
  });
});
