import { z } from "zod";

/**
 * Per-user pins of space artifacts onto the Work sidebar and dashboard
 * (`shell.spaces.artifact_pins.v1`).
 *
 * Pinning does not change ownership (`scope_type`); it is one person's short
 * list of artifacts they want at hand. Same rationale as conversation
 * Favourites: personal nav, not a grant.
 */
export const SPACES_ARTIFACT_PINS_SETTING_KEY = "shell.spaces.artifact_pins.v1";

export const SPACES_ARTIFACT_PINS_MAX_PER_SPACE = 40;

export const spacesArtifactPinsSpaceSchema = z.object({
  pinned: z.array(z.string().min(1)).max(SPACES_ARTIFACT_PINS_MAX_PER_SPACE),
});

export const spacesArtifactPinsDocumentSchema = z.object({
  spaces: z.record(z.string().min(1), spacesArtifactPinsSpaceSchema),
  v: z.literal(1),
});

export type SpacesArtifactPinsSpace = z.infer<
  typeof spacesArtifactPinsSpaceSchema
>;
export type SpacesArtifactPinsDocument = z.infer<
  typeof spacesArtifactPinsDocumentSchema
>;

export function emptySpacesArtifactPinsDocument(): SpacesArtifactPinsDocument {
  return { spaces: {}, v: 1 };
}

export function emptySpacesArtifactPinsSpace(): SpacesArtifactPinsSpace {
  return { pinned: [] };
}

/**
 * Tolerant read: anything that does not parse becomes `null`, and callers fall
 * back to an empty doc. A leftover shape must degrade to "no pins" rather than
 * throw on the Work tab.
 */
export function parseSpacesArtifactPinsDocument(
  value: unknown
): SpacesArtifactPinsDocument | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const parsed = spacesArtifactPinsDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function artifactPinsForSpace(
  doc: SpacesArtifactPinsDocument,
  spaceId: string
): string[] {
  return doc.spaces[spaceId]?.pinned ?? [];
}

export function isSpaceArtifactPinned(
  doc: SpacesArtifactPinsDocument,
  spaceId: string,
  artifactId: string
): boolean {
  const id = artifactId.trim();
  return Boolean(id && artifactPinsForSpace(doc, spaceId).includes(id));
}

/**
 * Keep `items` in the order of `pinnedIds`, dropping ids that are missing.
 * Dashboard and sidebar share this so they cannot disagree about the list.
 */
export function pinnedArtifactsInOrder<T extends { id: string }>(
  items: readonly T[],
  pinnedIds: readonly string[]
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const next: T[] = [];
  for (const id of pinnedIds) {
    const item = byId.get(id);
    if (item) {
      next.push(item);
    }
  }
  return next;
}

function writeSpace(
  doc: SpacesArtifactPinsDocument,
  spaceId: string,
  slice: SpacesArtifactPinsSpace
): SpacesArtifactPinsDocument {
  const id = spaceId.trim();
  if (!id) {
    return doc;
  }
  return {
    spaces: { ...doc.spaces, [id]: slice },
    v: 1,
  };
}

function uniqueIds(ids: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    next.push(trimmed);
    if (next.length >= max) {
      break;
    }
  }
  return next;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Pinning appends; a pin already present is a no-op. */
export function pinSpaceArtifact(
  doc: SpacesArtifactPinsDocument,
  spaceId: string,
  artifactId: string
): SpacesArtifactPinsDocument {
  const id = artifactId.trim();
  if (!id) {
    return doc;
  }
  const slice = artifactPinsForSpace(doc, spaceId);
  if (slice.includes(id)) {
    return doc;
  }
  const pinned = uniqueIds([...slice, id], SPACES_ARTIFACT_PINS_MAX_PER_SPACE);
  if (!pinned.includes(id)) {
    return doc;
  }
  return writeSpace(doc, spaceId, { pinned });
}

export function unpinSpaceArtifact(
  doc: SpacesArtifactPinsDocument,
  spaceId: string,
  artifactId: string
): SpacesArtifactPinsDocument {
  const id = artifactId.trim();
  if (!id) {
    return doc;
  }
  const slice = artifactPinsForSpace(doc, spaceId);
  if (!slice.includes(id)) {
    return doc;
  }
  return writeSpace(doc, spaceId, {
    pinned: slice.filter((pinned) => pinned !== id),
  });
}

/** Drop ids that are no longer among this space's artifacts. */
export function pruneSpaceArtifactPins(
  doc: SpacesArtifactPinsDocument,
  spaceId: string,
  knownIds: readonly string[]
): SpacesArtifactPinsDocument {
  const allowed = new Set(
    knownIds.map((id) => id.trim()).filter((id) => id.length > 0)
  );
  const slice = artifactPinsForSpace(doc, spaceId);
  const pinned = uniqueIds(
    slice.filter((id) => allowed.has(id)),
    SPACES_ARTIFACT_PINS_MAX_PER_SPACE
  );
  if (sameList(pinned, slice)) {
    return doc;
  }
  return writeSpace(doc, spaceId, { pinned });
}
