import { describe, expect, it } from "vitest";
import {
  KB_HUB_PAGE_LAYOUT_DEFAULTS,
  movePageBlock,
} from "../src/schema/page-blocks.js";

describe("page block order", () => {
  it("swaps block order", () => {
    const layout = { blocks: [...KB_HUB_PAGE_LAYOUT_DEFAULTS.blocks] };
    const firstId = layout.blocks[0]?.id ?? "";
    const moved = movePageBlock(layout, firstId, 1);
    expect(moved.blocks[0]?.type).toBe("articles");
    expect(moved.blocks[1]?.type).toBe("categories");
  });
});
