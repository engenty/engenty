/** Sidebar category tree expand/collapse — roots default open, nested default closed. */

export interface CategoryTreeExpansionState {
  /** Categories explicitly collapsed (overrides root default-open). */
  collapsed: Set<string>;
  /** Nested categories explicitly expanded by the user. */
  expanded: Set<string>;
}

export function createCategoryTreeExpansionState(): CategoryTreeExpansionState {
  return { collapsed: new Set(), expanded: new Set() };
}

export function isCategoryBranchOpen(
  categoryId: string,
  depth: number,
  state: CategoryTreeExpansionState,
  query: string
): boolean {
  if (query.trim().length > 0) {
    return true;
  }
  if (state.collapsed.has(categoryId)) {
    return false;
  }
  if (state.expanded.has(categoryId)) {
    return true;
  }
  return depth === 0;
}

export function toggleCategoryBranch(
  categoryId: string,
  depth: number,
  state: CategoryTreeExpansionState,
  query: string
): CategoryTreeExpansionState {
  const open = isCategoryBranchOpen(categoryId, depth, state, query);
  const expanded = new Set(state.expanded);
  const collapsed = new Set(state.collapsed);
  if (open) {
    expanded.delete(categoryId);
    collapsed.add(categoryId);
  } else {
    expanded.add(categoryId);
    collapsed.delete(categoryId);
  }
  return { collapsed, expanded };
}

export function revealCategoryBranchIds(
  state: CategoryTreeExpansionState,
  categoryIds: Iterable<string>
): CategoryTreeExpansionState {
  const expanded = new Set(state.expanded);
  const collapsed = new Set(state.collapsed);
  for (const id of categoryIds) {
    expanded.add(id);
    collapsed.delete(id);
  }
  return { collapsed, expanded };
}

export function collapseAllCategoryBranches(): CategoryTreeExpansionState {
  return createCategoryTreeExpansionState();
}

export function expandAllCategoryBranches(
  categoryIds: Iterable<string>
): CategoryTreeExpansionState {
  return {
    collapsed: new Set(),
    expanded: new Set(categoryIds),
  };
}
