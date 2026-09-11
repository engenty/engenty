/** Reorder within one list. Unknown ids are a no-op (cross-list drops). */
export function arrayMoveIds(
  ids: readonly string[],
  activeId: string,
  overId: string
): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) {
    return [...ids];
  }
  const next = [...ids];
  const [item] = next.splice(from, 1);
  if (!item) {
    return [...ids];
  }
  next.splice(to, 0, item);
  return next;
}
