import { z } from "zod";

/**
 * Per-user recently opened items in a space's Data tree.
 *
 * A user-settings JSON doc, following `spaces-recent.ts`: no new table for a
 * short personal list. Keyed by `href` so a renamed file that kept its URL
 * stays one item.
 */
export const SPACE_DATA_LIBRARY_SETTING_KEY = "spaces.data.library.v1";

export const SPACE_DATA_LIBRARY_MAX_RECENT_PER_SPACE = 20;

export const SPACE_DATA_LIBRARY_KINDS = [
  "artifact",
  "bundle",
  "file",
  "folder",
  "mount",
  "project",
  "record",
] as const;

export const spaceDataLibraryItemSchema = z.object({
  href: z.string().min(1),
  kind: z.enum(SPACE_DATA_LIBRARY_KINDS),
  space_id: z.string().min(1),
  title: z.string().min(1),
  touched_at: z.string(),
});

export const spaceDataLibraryDocumentSchema = z.object({
  recent: z.array(spaceDataLibraryItemSchema).max(200),
  v: z.literal(1),
});

export type SpaceDataLibraryKind = (typeof SPACE_DATA_LIBRARY_KINDS)[number];
export type SpaceDataLibraryItem = z.infer<typeof spaceDataLibraryItemSchema>;
export type SpaceDataLibraryDocument = z.infer<
  typeof spaceDataLibraryDocumentSchema
>;

export function emptySpaceDataLibraryDocument(): SpaceDataLibraryDocument {
  return { recent: [], v: 1 };
}

/**
 * Tolerant read: anything that does not parse becomes `null`, and callers fall
 * back to an empty doc. A user-settings document survives across releases, so a
 * shape change must degrade to "no recents" rather than throw on the Data page.
 * A leftover `starred` key from an earlier shape is ignored.
 */
export function parseSpaceDataLibraryDocument(
  value: unknown
): SpaceDataLibraryDocument | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const parsed = spaceDataLibraryDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type SpaceDataLibraryItemInput = Omit<
  SpaceDataLibraryItem,
  "touched_at"
> & { touched_at?: string };

function withTouchedAt(item: SpaceDataLibraryItemInput): SpaceDataLibraryItem {
  return {
    href: item.href,
    kind: item.kind,
    space_id: item.space_id,
    title: item.title,
    touched_at: item.touched_at ?? new Date().toISOString(),
  };
}

function capForSpace(
  items: SpaceDataLibraryItem[],
  spaceId: string,
  max: number
): SpaceDataLibraryItem[] {
  const inSpace: SpaceDataLibraryItem[] = [];
  const others: SpaceDataLibraryItem[] = [];
  for (const item of items) {
    if (item.space_id === spaceId) {
      inSpace.push(item);
    } else {
      others.push(item);
    }
  }
  return [...inSpace.slice(0, max), ...others];
}

function forSpace(
  items: SpaceDataLibraryItem[],
  spaceId: string
): SpaceDataLibraryItem[] {
  return items.filter((item) => item.space_id === spaceId);
}

/** Move an item to the front of Recent for its space, de-duplicated and capped. */
export function touchSpaceDataRecent(
  doc: SpaceDataLibraryDocument,
  item: SpaceDataLibraryItemInput
): SpaceDataLibraryDocument {
  const next = withTouchedAt(item);
  if (!(next.space_id && next.href)) {
    return doc;
  }
  const without = doc.recent.filter(
    (entry) => !(entry.space_id === next.space_id && entry.href === next.href)
  );
  return {
    ...doc,
    recent: capForSpace(
      [next, ...without],
      next.space_id,
      SPACE_DATA_LIBRARY_MAX_RECENT_PER_SPACE
    ),
  };
}

export function spaceDataRecentForSpace(
  doc: SpaceDataLibraryDocument,
  spaceId: string
): SpaceDataLibraryItem[] {
  return forSpace(doc.recent, spaceId);
}
