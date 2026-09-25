/**
 * Per-space "done since you last looked" cursor for Space home.
 *
 * Held still for one visit; a space switch starts a new visit on the same
 * render so `/ai/spaces/<id>/home` never inherits the previous space's `since`.
 */

export function spaceHomeCursorKey(spaceId: string): string {
  return `engenty:space-home:${spaceId}:seen-at`;
}

export interface SpaceHomeVisit {
  since: string | null;
  spaceId: string | null;
}

export function readSpaceHomeCursor(spaceId: string | null): string | null {
  if (!spaceId || typeof localStorage === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(spaceHomeCursorKey(spaceId));
  } catch {
    return null;
  }
}

export function writeSpaceHomeCursor(spaceId: string, cursor: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(spaceHomeCursorKey(spaceId), cursor);
  } catch {
    // private mode / quota — the page then reports the last day, which is the
    // same answer a first visit gets.
  }
}

/**
 * Freeze the cursor for the current space. Switching spaces re-reads that
 * space's stored cursor; it never reuses the previous space's `since`.
 */
export function holdSpaceHomeVisit(
  spaceId: string | null,
  held: SpaceHomeVisit | null
): SpaceHomeVisit {
  if (held && held.spaceId === spaceId) {
    return held;
  }
  return { since: readSpaceHomeCursor(spaceId), spaceId };
}
