/**
 * Where an account may be used (PLAN-personal-connections.md):
 *
 * - a **Space** account in the Space that owns it — every agent and member of
 *   that Space shares it;
 * - a **personal** account by the person who owns it and their Copilot, in
 *   whatever Space the call runs.
 *
 * There is no per-agent grant and no "every space" flag.
 */
import type { ConnectionSummary } from "./types.js";

export type ConnectionReachSummary = Pick<
  ConnectionSummary,
  "id" | "owner_user_id" | "space_id"
>;

/**
 * Whose accounts one call reaches: the verified Space it runs in, and the
 * person whose own accounts it may use (see `resolvePersonalReach`). Either
 * may be null; both null reaches nothing.
 */
export interface ConnectionReach {
  personalUserId: string | null;
  spaceId: string | null;
}

/** Whether this account may be selected for a connector call with this reach. */
export function isAccountReachableInRun(params: {
  connection: ConnectionReachSummary;
  reach: ConnectionReach;
}): boolean {
  const { connection, reach } = params;
  const spaceId = reach.spaceId?.trim();
  if (connection.space_id) {
    return Boolean(spaceId) && connection.space_id === spaceId;
  }
  const personalUserId = reach.personalUserId?.trim();
  return Boolean(personalUserId) && connection.owner_user_id === personalUserId;
}

/**
 * Connector tool prefixes this agent may call: the plugins enabled on its
 * Space, narrowed by the agent's preferred list when it has one (empty = all
 * the Space offers).
 */
export function connectorPrefixesForAgent(params: {
  preferredPrefixes: ReadonlySet<string>;
  spacePrefixes: ReadonlySet<string>;
}): Set<string> {
  if (params.preferredPrefixes.size === 0) {
    return new Set(params.spacePrefixes);
  }
  return new Set(
    [...params.spacePrefixes].filter((prefix) =>
      params.preferredPrefixes.has(prefix)
    )
  );
}
