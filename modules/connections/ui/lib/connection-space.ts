/**
 * Which Space a connection belongs to, and which Space a connect lands in.
 *
 * A connected account is owned by a Space: every agent and member of that
 * Space uses it, nobody outside it. Connecting always happens inside a Space —
 * the one the user stands in, or their personal Space (`/s/me`) from the
 * Copilot and other personal places.
 */
import type { CatalogConnection } from "../api.js";

/** The fields of core's `/api/spaces` row this module reads. */
export interface ConnectionSpaceRef {
  id: string;
  key: string;
  name: string;
  /** Set ⇒ somebody's personal Space. */
  ownerUserId: string | null;
}

/**
 * The viewer's personal Space. The `/api/spaces` list is membership-filtered,
 * so the viewer's own personal Space is the one they own.
 */
export function findPersonalSpace(
  spaces: readonly ConnectionSpaceRef[],
  currentUserId: string | null
): ConnectionSpaceRef | null {
  if (!currentUserId) {
    return null;
  }
  return spaces.find((space) => space.ownerUserId === currentUserId) ?? null;
}

/** Accounts of one Space. `null` Space (not resolved yet) → none. */
export function connectionsInSpace<
  T extends Pick<CatalogConnection, "space_id">,
>(connections: readonly T[], spaceId: string | null): T[] {
  if (!spaceId) {
    return [];
  }
  return connections.filter((connection) => connection.space_id === spaceId);
}
