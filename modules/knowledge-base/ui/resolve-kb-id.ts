/**
 * The knowledge base a page works in: the space's one library. There is no
 * choice to make — a space has exactly one — so the first (and only) row of
 * the space-scoped list is it. Empty means the space has none yet.
 */
export function spaceKbId(kbs: Array<{ id: string }>): string {
  return kbs[0]?.id ?? "";
}
