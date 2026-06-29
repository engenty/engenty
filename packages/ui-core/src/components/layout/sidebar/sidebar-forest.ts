/**
 * Generic depth-first tree ("forest") helpers for sidebar lists where each node
 * carries a typed item and ordered children.
 */

export interface SidebarForest<T> {
  children: SidebarForest<T>[];
  item: T;
}

export function filterSidebarForest<T>(
  forest: SidebarForest<T>[],
  normalizedQuery: string,
  matches: (item: T, normalizedQuery: string) => boolean
): SidebarForest<T>[] {
  if (!normalizedQuery) {
    return forest;
  }
  return forest
    .map((n) => ({
      item: n.item,
      children: filterSidebarForest(n.children, normalizedQuery, matches),
    }))
    .filter((n) => matches(n.item, normalizedQuery) || n.children.length > 0);
}

export function capSidebarForest<T>(
  forest: SidebarForest<T>[],
  maxSiblings: number
): SidebarForest<T>[] {
  if (!Number.isFinite(maxSiblings) || maxSiblings <= 0) {
    return [];
  }
  return forest.slice(0, maxSiblings).map((n) => ({
    item: n.item,
    children: capSidebarForest(n.children, maxSiblings),
  }));
}

export function sidebarForestSome<T>(
  forest: SidebarForest<T>[],
  pred: (item: T) => boolean
): boolean {
  return forest.some(
    (n) => pred(n.item) || sidebarForestSome(n.children, pred)
  );
}
