/**
 * Where an account may be used: in the Space that owns it, and nowhere else
 * (PLAN-space-owned-connections.md). Every agent and member of that Space
 * shares it — there is no per-agent grant and no "every space" flag.
 */
import type { ConnectionSummary } from "./types.js";

export type ConnectionReachSummary = Pick<ConnectionSummary, "id" | "space_id">;

/**
 * Whether this account may be selected for a connector call in this run. A
 * run that names no Space reaches no account: a connection is always some
 * Space's, and guessing which would be the leak this rule exists to close.
 */
export function isAccountReachableInRun(params: {
  connection: ConnectionReachSummary;
  spaceId: string | null | undefined;
}): boolean {
  const spaceId = params.spaceId?.trim();
  return Boolean(spaceId) && params.connection.space_id === spaceId;
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
