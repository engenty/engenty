import type { SpaceConnectionAccess } from "./space-mounts.js";
import type {
  ConnectionActionPolicy,
  ConnectionAutonomousMode,
  ConnectionPolicyOverride,
  ConnectionSummary,
  ConnectorAction,
} from "./types.js";
import { ACTION_GROUP_DEFAULT_POLICY } from "./types.js";

/** Least to most permissive — the order both autonomy clamps compare on. */
const AUTONOMY_ORDER: ConnectionAutonomousMode[] = ["off", "read_only", "full"];

/**
 * The space's level said as an autonomous mode, so the two halves are compared
 * in one vocabulary rather than each having its own idea of "read".
 */
const SPACE_ACCESS_AS_AUTONOMY: Record<
  SpaceConnectionAccess,
  ConnectionAutonomousMode
> = {
  none: "off",
  read: "read_only",
  write: "full",
};

/**
 * How far an unattended run may go with this account HERE: the lower of the
 * space's level and the account owner's ceiling (PLAN-connections-ux.md B1,
 * decision (b)).
 *
 * A space that never chose a level (`null`) is not a space that chose `none` —
 * it falls through to the account setting alone, which is exactly what every
 * space did before the level existed. And the account stays a ceiling rather
 * than a floor, so an owner switching their account to `off` shuts it off in
 * every space in one move, whatever those spaces asked for.
 */
function effectiveAutonomy(
  accountMode: ConnectionAutonomousMode,
  spaceAccess: SpaceConnectionAccess | null | undefined
): { from: "account" | "space"; mode: ConnectionAutonomousMode } {
  if (!spaceAccess) {
    return { from: "account", mode: accountMode };
  }
  const spaceMode = SPACE_ACCESS_AS_AUTONOMY[spaceAccess];
  return AUTONOMY_ORDER.indexOf(spaceMode) <=
    AUTONOMY_ORDER.indexOf(accountMode)
    ? { from: "space", mode: spaceMode }
    : { from: "account", mode: accountMode };
}

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
 *   - run context: autonomous principals (agent/service) are clamped by the
 *     lower of the space's level and the account's `autonomous_mode` — `off`
 *     denies all, `read_only` denies non-read groups; `ask` outcomes stay
 *     `ask` (the caller decides how ask surfaces for autonomous runs).
 *
 * Account reach (space mount ∪ all-spaces ∪ agent grant) is decided by the
 * caller before this function runs — this resolver no longer reads `sharing`.
 */
export function resolveConnectionActionPolicy(params: {
  action: Pick<ConnectorAction, "group" | "id">;
  connection: Pick<ConnectionSummary, "autonomous_mode" | "owner_user_id">;
  /**
   * The acting AGENT holds an explicit grant on this connection.
   * Reach (whether the account is a candidate) is decided before this
   * function; the flag is accepted so callers do not have to change shape.
   */
  hasAgentGrant?: boolean;
  /**
   * The run acts for the VERIFIED owner of its personal space. Candidate
   * listing still uses it; this resolver no longer clamps on sharing.
   */
  actsForSpaceOwner?: boolean;
  /** True when the run has no live user session (task jobs, triggers). */
  isAutonomous: boolean;
  overrides: readonly Pick<ConnectionPolicyOverride, "policy" | "selector">[];
  principal: ConnectionPolicyPrincipal;
  /**
   * What the RUN'S SPACE allows with this account (`space_mount.agent_access`,
   * PLAN-connections-ux.md B1). Absent or null means the space never decided,
   * and the account's own `autonomous_mode` decides alone — the behaviour of
   * every caller that does not know about spaces, and of every space that has
   * not set a level.
   *
   * Like `autonomous_mode`, it clamps UNATTENDED runs only: a mount level says
   * what this space's engentys may do, not what a person sitting in the space
   * may do.
   */
  spaceAccess?: SpaceConnectionAccess | null;
}): ResolvedConnectionPolicy {
  const { action, connection, isAutonomous, overrides, spaceAccess } = params;

  if (isAutonomous) {
    const autonomy = effectiveAutonomy(connection.autonomous_mode, spaceAccess);
    // The reason names WHICH half said no, because the two are fixed in
    // different places: the space's level in the space's settings, the
    // account's mode by its owner. "Denied" without that is a dead end.
    if (autonomy.mode === "off") {
      return {
        decision: "deny",
        reason:
          autonomy.from === "space"
            ? "connection_space_access_none"
            : "connection_autonomous_disabled",
      };
    }
    if (autonomy.mode === "read_only" && action.group !== "read") {
      return {
        decision: "deny",
        reason:
          autonomy.from === "space"
            ? "connection_space_access_read_only"
            : "connection_autonomous_read_only",
      };
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
