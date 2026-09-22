/**
 * Where an account may be used after personal/org sharing stopped being the
 * access model (space plugin marketplace Phase 1).
 *
 * Reach is the union of:
 *   - accounts mounted on the active space
 *   - accounts flagged `all_spaces`
 *   - accounts granted to the acting agent (even when the standing space did
 *     not mount them — otherwise "enable on copilot" vanishes in Marketing)
 *
 * An agent's preferred connector list (empty = all space-enabled plugins)
 * intersects space plugins, then always re-adds that agent's personal accounts.
 */
import type { ConnectionSummary } from "./types.js";

export type ConnectionReachSummary = Pick<
  ConnectionSummary,
  "all_spaces" | "id" | "owner_user_id"
>;

/**
 * What a person may see in settings / inbox / files lists (matches RLS):
 * accounts they own, and accounts flagged for every space.
 *
 * Space-mounted accounts they do not own are added by the caller from the
 * mount set (the authenticated grant already includes those rows).
 */
export function connectionVisibleToUser(
  connection: ConnectionReachSummary,
  userId: string | null | undefined
): boolean {
  if (connection.all_spaces) {
    return true;
  }
  return Boolean(userId) && connection.owner_user_id === userId;
}

/**
 * Owner stamped on inbox/calendar/file records: all-spaces accounts are
 * tenant-shared (no personal owner scope); others stay with the authenticator.
 */
export function connectionRecordOwnerUserId(
  connection: Pick<ConnectionReachSummary, "all_spaces" | "owner_user_id">
): string | null {
  return connection.all_spaces ? null : connection.owner_user_id;
}

/**
 * Whether this account may be selected for a connector call in this run.
 *
 * `mountedIds === null` means no space was named. Inside a space, grants bypass
 * the mount set. Outside a space, an acting agent sees grants + all-spaces
 * only — not every mailbox the person owns.
 */
export function isAccountReachableInRun(params: {
  agentGrantedIds?: ReadonlySet<string> | null;
  agentId?: string | null;
  connection: ConnectionReachSummary;
  /** Null = no space named; empty set = this space mounted no accounts. */
  mountedIds?: ReadonlySet<string> | null;
  principalId?: string | null;
}): boolean {
  const granted = params.agentGrantedIds?.has(params.connection.id) === true;
  if (params.mountedIds) {
    return (
      params.mountedIds.has(params.connection.id) ||
      granted ||
      params.connection.all_spaces === true
    );
  }
  if (params.agentId?.trim()) {
    return granted || params.connection.all_spaces === true;
  }
  return connectionVisibleToUser(params.connection, params.principalId);
}

/**
 * Connector tool prefixes this agent may call.
 *
 * Empty preferred list = all plugins enabled on the space (plus all-spaces),
 * union the agent's personal-account prefixes. Non-empty = intersection plus
 * those personal accounts. With no space, the space set is empty and
 * all-spaces + grants are the whole surface.
 */
export function connectorPrefixesForAgent(params: {
  allSpacesPrefixes: ReadonlySet<string>;
  grantPrefixes: ReadonlySet<string>;
  hasSpace: boolean;
  preferredPrefixes: ReadonlySet<string>;
  spacePrefixes: ReadonlySet<string>;
}): Set<string> {
  const enabled = new Set(params.allSpacesPrefixes);
  if (params.hasSpace) {
    for (const prefix of params.spacePrefixes) {
      enabled.add(prefix);
    }
  }
  if (params.preferredPrefixes.size === 0) {
    return new Set([...enabled, ...params.grantPrefixes]);
  }
  const intersected = [...enabled].filter((prefix) =>
    params.preferredPrefixes.has(prefix)
  );
  return new Set([...intersected, ...params.grantPrefixes]);
}

/**
 * Twin of `20260921220000_plugin_connections_space_plugins.sql`:
 * an org account with no space mount becomes all-spaces.
 */
export function shouldMigrateOrgAccountToAllSpaces(params: {
  hasSpaceMount: boolean;
  sharing: "org" | "personal";
}): boolean {
  return params.sharing === "org" && !params.hasSpaceMount;
}
