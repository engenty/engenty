import type {
  ConnectionActionPolicy,
  ConnectionPolicyOverride,
  ConnectionSummary,
  ConnectorAction,
  ConnectorActionGroup,
} from "./types.js";
import { ACTION_GROUP_DEFAULT_POLICY } from "./types.js";

const GROUP_ORDER: ConnectorActionGroup[] = ["read", "write", "destructive"];

export interface ConnectionPolicyPrincipal {
  /**
   * The principal's capability set, when the caller has it. Used only for the
   * per-connector scope check (CON-02); omitted means "not supplied", which
   * that check reads as unrestricted — the authoritative gate is the
   * connections profile policy, which always has it.
   */
  capabilities?: readonly string[];
  /** Set for user principals; agents/services carry the acting user when live. */
  principalId: string;
  principalType: "user" | "agent" | "service";
}

export type ResolvedConnectionPolicy =
  | { decision: "allow" }
  | { decision: "ask" }
  | { decision: "deny"; reason: string };

/**
 * Resolve the effective policy for one action on one connection.
 *
 * Layers, most specific wins:
 *   1. action-id override  (`search_threads`)
 *   2. group override      (`group:read`)
 *   3. group default       (read→allow, write/destructive→ask)
 *
 * Then the cross-axis clamps, applied in order:
 *   - sharing: non-owners on org connections are capped at
 *     `non_owner_max_group` (actions in higher groups → deny)
 *   - run context: autonomous principals (agent/service) — `off` denies all,
 *     `read_only` denies non-read groups; `ask` outcomes stay `ask` (the
 *     caller decides how ask surfaces for autonomous runs).
 */
export function resolveConnectionActionPolicy(params: {
  action: Pick<ConnectorAction, "group" | "id">;
  connection: Pick<
    ConnectionSummary,
    "autonomous_mode" | "non_owner_max_group" | "owner_user_id" | "sharing"
  >;
  /** True when the run has no live user session (task jobs, triggers). */
  isAutonomous: boolean;
  overrides: readonly Pick<ConnectionPolicyOverride, "policy" | "selector">[];
  principal: ConnectionPolicyPrincipal;
}): ResolvedConnectionPolicy {
  const { action, connection, isAutonomous, overrides, principal } = params;

  // Sharing clamp before anything else: a personal connection is only usable
  // by its owner (agents act on behalf of the acting user carried on auth).
  const isOwner =
    connection.owner_user_id !== null &&
    connection.owner_user_id === principal.principalId;
  if (connection.sharing === "personal" && !isOwner) {
    return {
      decision: "deny",
      reason: "connection_personal_not_owner",
    };
  }
  if (
    connection.sharing === "org" &&
    !isOwner &&
    connection.non_owner_max_group !== null &&
    GROUP_ORDER.indexOf(action.group) >
      GROUP_ORDER.indexOf(connection.non_owner_max_group)
  ) {
    return {
      decision: "deny",
      reason: "connection_non_owner_group_cap",
    };
  }

  if (isAutonomous) {
    if (connection.autonomous_mode === "off") {
      return { decision: "deny", reason: "connection_autonomous_disabled" };
    }
    if (connection.autonomous_mode === "read_only" && action.group !== "read") {
      return { decision: "deny", reason: "connection_autonomous_read_only" };
    }
  }

  const byAction = overrides.find((o) => o.selector === action.id);
  const byGroup = overrides.find((o) => o.selector === `group:${action.group}`);
  const policy: ConnectionActionPolicy =
    byAction?.policy ??
    byGroup?.policy ??
    ACTION_GROUP_DEFAULT_POLICY[action.group];

  if (policy === "deny") {
    return { decision: "deny", reason: "connection_action_denied" };
  }
  return { decision: policy };
}

/**
 * Operation ids on this connection that the user durably allowed even though
 * the static contract requires approval. Merged into the run's approval
 * grants so live chat does not suspend for them.
 */
export function grantedOperationIds(params: {
  actions: readonly Pick<ConnectorAction, "group" | "id">[];
  connection: Parameters<typeof resolveConnectionActionPolicy>[0]["connection"];
  isAutonomous: boolean;
  overrides: readonly Pick<ConnectionPolicyOverride, "policy" | "selector">[];
  principal: ConnectionPolicyPrincipal;
  toolPrefix: string;
}): string[] {
  const granted: string[] = [];
  for (const action of params.actions) {
    if (action.group === "read") {
      continue; // read never requires approval statically
    }
    const resolved = resolveConnectionActionPolicy({
      action,
      connection: params.connection,
      isAutonomous: params.isAutonomous,
      overrides: params.overrides,
      principal: params.principal,
    });
    if (resolved.decision === "allow") {
      granted.push(`${params.toolPrefix}_${action.id}`);
    }
  }
  return granted;
}
