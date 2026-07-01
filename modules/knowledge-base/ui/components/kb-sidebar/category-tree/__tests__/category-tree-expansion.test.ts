import { describe, expect, it } from "vitest";
import {
  createCategoryTreeExpansionState,
  isCategoryBranchOpen,
  toggleCategoryBranch,
} from "../category-tree-expansion.js";

describe("category tree expansion", () => {
  it("keeps root categories open by default", () => {
    const state = createCategoryTreeExpansionState();
    expect(isCategoryBranchOpen("root", 0, state, "")).toBe(true);
    expect(isCategoryBranchOpen("child", 1, state, "")).toBe(false);
  });

  it("expanding a nested category does not collapse root categories", () => {
    let state = createCategoryTreeExpansionState();
    state = toggleCategoryBranch("child", 1, state, "");
    expect(isCategoryBranchOpen("root", 0, state, "")).toBe(true);
    expect(isCategoryBranchOpen("child", 1, state, "")).toBe(true);
  });

  it("toggles root collapse without affecting nested expansion", () => {
    let state = createCategoryTreeExpansionState();
    state = toggleCategoryBranch("child", 1, state, "");
    state = toggleCategoryBranch("root", 0, state, "");
    expect(isCategoryBranchOpen("root", 0, state, "")).toBe(false);
    expect(isCategoryBranchOpen("child", 1, state, "")).toBe(true);
  });
});
