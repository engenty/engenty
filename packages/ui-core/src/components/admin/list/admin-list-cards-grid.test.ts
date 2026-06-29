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
});
