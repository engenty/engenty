/**
 * Whose accounts a surface shows, and who a connect makes the owner
 * (PLAN-personal-connections.md).
 *
 * A connected account belongs to a Space — every agent and member of that
 * Space uses it — or to one person, who uses it with their Copilot in any
 * Space. Surfaces pass a target: a Space id, or null for the viewer's own
 * accounts (the Copilot, the personal settings page).
 */
import type { CatalogConnection } from "../api.js";

/** The accounts of one owner: that Space's, or with `null` the viewer's own. */
export function connectionsInSpace<
  T extends Pick<CatalogConnection, "space_id">,
>(connections: readonly T[], target: string | null): T[] {
  return connections.filter((connection) => connection.space_id === target);
}

/**
 * Who the dialog, detail and connect card serve: one Space (its members and
 * engenties use the accounts), or `"me"` — the viewer, whose accounts only
 * they and their Copilot use.
 */
export type ConnectionsOwner =
  | { spaceId: string; spaceName?: string | null }
  | "me";

/** The target the catalog and connect routes take: a Space id, or null. */
export function ownerTarget(owner: ConnectionsOwner): string | null {
  return owner === "me" ? null : owner.spaceId;
}
