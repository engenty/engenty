import { describe, expect, it, vi } from "vitest";
import {
  attachSidebarListInsertDropHandlers,
  computeSidebarListInsertPlace,
} from "./sidebar-list-insert";

describe("computeSidebarListInsertPlace", () => {
  it("returns before in top half", () => {
    expect(computeSidebarListInsertPlace(40, { top: 0, height: 100 })).toBe(
      "before"
    );
  });

  it("returns after in bottom half", () => {
    expect(computeSidebarListInsertPlace(60, { top: 0, height: 100 })).toBe(
      "after"
    );
  });
});

describe("attachSidebarListInsertDropHandlers", () => {
  it("shows insert bar when drop target matches row", () => {
    const h = attachSidebarListInsertDropHandlers({
      rowId: "a",
      draggingId: "b",
      dropTarget: { id: "a", place: "before" },
      onDragLeaveTarget: vi.fn(),
      onDragOverRow: vi.fn(),
      onDropRow: vi.fn(),
    });
    expect(h.showInsertBar).toBe(true);
    expect(h.insertPlace).toBe("before");
  });

  it("hides insert bar when dragging same row", () => {
    const h = attachSidebarListInsertDropHandlers({
      rowId: "a",
      draggingId: "a",
      dropTarget: { id: "a", place: "before" },
      onDragLeaveTarget: vi.fn(),
      onDragOverRow: vi.fn(),
      onDropRow: vi.fn(),
    });
    expect(h.showInsertBar).toBe(false);
  });
});
