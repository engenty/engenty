import { describe, expect, it } from "vitest";
import {
  addBlockAt,
  addGroupAt,
  addLineItemAt,
  addSubItemToParent,
  recalculateCommercialIndex,
} from "./commercial-block-operations";
import type { CommercialBlock } from "./types";

function lineItem(
  id: string,
  overrides: Record<string, unknown> = {}
): CommercialBlock {
  return {
    id,
    type: "line_item",
    order_index: 0,
    content: {
      title: id,
      amount: 1,
      cost_per_item: 100,
      tax: 20,
      unit: "h",
      ...overrides,
    },
  };
}

describe("commercial block operations", () => {
  it("inserts phase start at current phase boundary", () => {
    const blocks: CommercialBlock[] = [
      {
        id: "phase-1",
        type: "headline",
        order_index: 0,
        content: { title: "Phase 1", is_phase: true },
      },
      lineItem("item-1"),
      {
        id: "text-1",
        type: "text",
        order_index: 2,
        content: { content: "notes" },
      },
      {
        id: "phase-2",
        type: "headline",
        order_index: 3,
        content: { title: "Phase 2", is_phase: true },
      },
    ];

    const result = addBlockAt(blocks, 1, "phase_start", 20, () => "new-phase");
    const insertedIndex = result.blocks.findIndex((b) => b.id === "new-phase");

    expect(insertedIndex).toBe(3);
    expect((result.blocks[insertedIndex].content as any).is_phase).toBe(true);
  });

  it("adds group as parent and first child", () => {
    const result = addGroupAt(
      [],
      0,
      20,
      (() => {
        let n = 0;
        return () => `id-${++n}`;
      })()
    );

    expect(result.blocks).toHaveLength(2);
    const parent = result.blocks[0];
    const child = result.blocks[1];
    expect(parent.type).toBe("line_item");
    expect(child.type).toBe("line_item");
    expect((child.content as any).parent_id).toBe(parent.id);
  });

  it("adds sub-item after existing children of same parent", () => {
    const parent = lineItem("parent");
    const childA = lineItem("child-a", { parent_id: "parent" });
    const childB = lineItem("child-b", { parent_id: "parent" });
    const nextTopLevel = lineItem("top-2");
    const blocks = [parent, childA, childB, nextTopLevel].map((b, i) => ({
      ...b,
      order_index: i,
    }));

    const result = addSubItemToParent(blocks, "parent", 20, () => "child-c");
    expect(result).not.toBeNull();
    const insertedIndex = result!.blocks.findIndex((b) => b.id === "child-c");
    const topLevelIndex = result!.blocks.findIndex((b) => b.id === "top-2");
    expect(insertedIndex).toBe(topLevelIndex - 1);
    expect((result!.blocks[insertedIndex].content as any).parent_id).toBe(
      "parent"
    );
  });

  it("keeps page-break line items unnumbered", () => {
    const result = addLineItemAt([], 0, "page_break", 20, () => "pb-1");
    const pageBreak = result.blocks[0];
    expect((pageBreak.content as any).line_item_subtype).toBe("page_break");
    expect((pageBreak.content as any).position).toBeNull();
  });

  it("recalculates index and clears manual positions", () => {
    const blocks = [
      lineItem("manual-1", {
        position_manual: true,
        position: "9.9",
      }),
      lineItem("manual-2", {
        position_manual: true,
        position: "8.8",
      }),
    ];

    const recalculated = recalculateCommercialIndex(blocks);
    expect((recalculated[0].content as any).position_manual).toBe(false);
    expect((recalculated[1].content as any).position_manual).toBe(false);
    expect((recalculated[0].content as any).position).not.toBe("9.9");
  });
});
