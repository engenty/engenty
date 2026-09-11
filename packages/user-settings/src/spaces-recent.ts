import { z } from "zod";

/**
 * Per-user space recency (PLAN-spaces.md Phase 5a ②).
 *
 * A user-settings JSON doc, following `favorites-nav.ts` exactly — no new
 * table for a list of at most 20 ids.
 *
 * **Deliberately NOT `shell.dock_module_order`.** That key is org-wide because
 * an admin curates which apps the rail shows; which spaces *you* visited is
 * personal, and storing it org-wide would make one person's navigation reorder
 * everyone else's rail.
 */
export const SPACES_RECENT_SETTING_KEY = "shell.spaces.recent.v1";

export const SPACES_RECENT_MAX_ITEMS = 20;

export const spaceRecentItemSchema = z.object({
  space_id: z.string().min(1),
  visited_at: z.string(),
});

export const spacesRecentDocumentSchema = z.object({
  items: z.array(spaceRecentItemSchema).max(SPACES_RECENT_MAX_ITEMS),
  v: z.literal(1),
});

export type SpaceRecentItem = z.infer<typeof spaceRecentItemSchema>;
export type SpacesRecentDocument = z.infer<typeof spacesRecentDocumentSchema>;

export function emptySpacesRecentDocument(): SpacesRecentDocument {
  return { items: [], v: 1 };
}

/**
 * Tolerant read: anything that does not parse becomes `null`, and callers fall
 * back to an empty doc. A user-settings document survives across releases, so a
 * shape change must degrade to "no recency" rather than throw inside the shell
 * that renders every screen.
 */
export function parseSpacesRecentDocument(
  value: unknown
): SpacesRecentDocument | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const parsed = spacesRecentDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Move a space to the front, newest first, de-duplicated and capped. */
export function touchSpaceRecency(
  doc: SpacesRecentDocument,
  spaceId: string,
  visitedAt: string = new Date().toISOString()
): SpacesRecentDocument {
  const id = spaceId.trim();
  if (!id) {
    return doc;
  }
  const without = doc.items.filter((item) => item.space_id !== id);
  return {
    items: [{ space_id: id, visited_at: visitedAt }, ...without].slice(
      0,
      SPACES_RECENT_MAX_ITEMS
    ),
    v: 1,
  };
}

/**
 * Recency as an ordered id list, newest first.
 *
 * De-duplicates defensively: the writer already de-duplicates, but a doc
 * written by an older build (or hand-edited) must not make one space occupy two
 * rail slots.
 */
export function spacesRecentOrder(doc: SpacesRecentDocument): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const item of doc.items) {
    if (seen.has(item.space_id)) {
      continue;
    }
    seen.add(item.space_id);
    order.push(item.space_id);
  }
  return order;
}
