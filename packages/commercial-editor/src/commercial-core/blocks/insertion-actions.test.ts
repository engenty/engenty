import { describe, expect, it, vi } from "vitest";
import {
  executeInsertionAction,
  getInsertionActionsForGroup,
} from "./insertion-actions";

describe("insertion actions", () => {
  it("includes page-break option in shared menu groups", () => {
    const tableActions = getInsertionActionsForGroup("tableFooter", {
      allowGroup: true,
      allowLineItemSubtype: true,
    });
    const blockActions = getInsertionActionsForGroup("blockMenu", {
      allowPhase: true,
      allowGroup: true,
      allowLineItemSubtype: true,
    });

    expect(tableActions.some((a) => a.id === "line_item_page_break")).toBe(
      true
    );
    expect(blockActions.some((a) => a.id === "line_item_page_break")).toBe(
      true
    );
  });

  it("dispatches insertion handlers correctly", () => {
    const handlers = {
      addBlockAbove: vi.fn(),
      addGroup: vi.fn(),
      addLineItemAbove: vi.fn(),
      addSubItem: vi.fn(),
    };

    executeInsertionAction({
      actionId: "phase_start",
      atIndex: 2,
      handlers,
    });
    executeInsertionAction({
      actionId: "group_position",
      atIndex: 2,
      handlers,
    });
    executeInsertionAction({
      actionId: "line_item_page_break",
      atIndex: 4,
      handlers,
    });
    executeInsertionAction({
      actionId: "sub_item",
      atIndex: 4,
      handlers,
      parentId: "parent-1",
    });

    expect(handlers.addBlockAbove).toHaveBeenCalledWith(2, "phase_start");
    expect(handlers.addGroup).toHaveBeenCalledWith(2);
    expect(handlers.addLineItemAbove).toHaveBeenCalledWith(4, "page_break");
    expect(handlers.addSubItem).toHaveBeenCalledWith("parent-1");
  });
});
