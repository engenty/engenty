import type {
  ConnectionsRepo,
  ConnectorActionGroup,
  SpaceConnectionAccess,
} from "@engenty/connections-sdk";
import {
  connectorScopeAllows,
  connectorScopeDenialReason,
  describeSelectionFailure,
  resolveConnectionActionPolicy,
  resolveConnectorOperation,
  selectConnectionForAccount,
} from "@engenty/connections-sdk";
import type {
  PluginPolicyInput,
  PluginProfilePolicy,
} from "@engenty/plugin-sdk";

/**
 * The authoritative gate for connector operations, registered as an async
 * profile policy in core:
 *
 * - `deny` clamps (personal/not-owner, non-owner group cap, autonomous mode,
 *   user-configured deny, and — CN.3 — an account the run's space does not
 *   mount) are enforced for every principal.
 * - INTERACTIVE user principals with an `ask` outcome return `null`: live chat
 *   approval stays with the AI-side native suspend/resume pre-gate.
 * - autonomous callers — agent/service principals, AND user-token calls whose
 *   origin is an engenty App (no chat pre-gate behind them) — `ask` →
 *   require_approval with connection context attached; core's approval gate
 *   consumes a standing grant or files the durable request. Explicit `allow`
 *   overrides return `allow`, bypassing core's default approval requirement
 *   for non-user principals.
 */
export function createConnectionsProfilePolicy(
  /** Tenant-locked repo factory (Phase A) — resolved per evaluated call. */
  getRepo: (auth: { tenantId: string }) => ConnectionsRepo,
  /**
   * The space's mounted accounts and what this space's engentys may do with
   * each (CN.3 + PLAN-connections-ux.md B1), or omitted in tests and installs
   * without spaces. Returning null means "do not narrow".
   *
   * One read answers both questions on purpose: which accounts are here and how
   * far they go must never be two lookups that can disagree.
   */
  getMountedConnectionAccess?: (params: {
    spaceId: string;
    tenantId: string;
  }) => Promise<Map<string, SpaceConnectionAccess | null> | null>,
  /**
   * The VERIFIED personal-space owner a headless run acts for
   * (PLAN-space-computer.md §2.1): non-user principal, routine bound to
   * exactly this space, space has an owner — or null. Core wires this to
   * `resolveVerifiedSpaceOwnerForRun`; omitted (tests, spaceless installs)
   * means no owner reach, which is the pre-feature behaviour.
   */
  getVerifiedSpaceOwner?: (params: {
    principalType: "user" | "agent" | "service";
    spaceId: string;
    tenantId: string;
    triggerId: string | null;
  }) => Promise<string | null>
): PluginProfilePolicy {
  return async (input: PluginPolicyInput) => {
    const match = resolveConnectorOperation(input.operationId);
    if (!match) {
      return null;
    }
    const { action, connector } = match;
    // CON-02 — which connectors this grant may be spent on. Core's operation
    // gate has already checked the broad `module.connections.write`; a role
    // scoped to named connectors is refused here, before any connection is
    // resolved or any approval recorded. A principal naming no connector is
    // unrestricted, so every pre-CON-02 grant behaves exactly as before.
    if (
      !connectorScopeAllows({
        capabilities: input.auth.capabilities,
        connectorId: connector.id,
        group: action.group as ConnectorActionGroup,
      })
    ) {
      return {
        action: "deny",
        reason: connectorScopeDenialReason({
          connectorId: connector.id,
          connectorName: connector.name,
          group: action.group as ConnectorActionGroup,
        }),
      };
    }
    // "Autonomous" here means "no human is watching this turn", not "not a
    // user". An engenty App rides the viewing user's token (CON-01) yet runs
    // with no chat pre-gate behind it, so an `ask` outcome had nothing at all
    // standing between an App and gmail_send_message. Treat it like any other
    // unattended caller: record the approval request and answer 202.
    const isAutonomous =
      input.auth.principalType !== "user" || input.auth.callOrigin === "app";
    const repo = getRepo({ tenantId: input.auth.tenantId });
    // CN.5 — the acting agent's own grants, resolved BEFORE the candidates so
    // a granted personal account is a candidate at all. Read off `agentId`
    // rather than the principal on purpose: a headless task already forwards
    // `x-engenty-agent-id`, so this works for the service-principal lane we
    // have today and for an agent-principal lane later, with neither a
    // precondition for the other.
    const agentId = input.auth.agentId?.trim();
    const agentGrants = agentId
      ? await repo.listAgentGrantedConnectionIds({ agentId })
      : null;
    // §2.1 — a run in a PERSONAL space acts with its owner's reach. Verified,
    // not claimed: the hook checks the routine's stored space binding, because
    // owner reach ADDS candidates and the space header alone must stay
    // narrowing-only. Null for every user principal and every unbound run.
    const spaceId = input.auth.spaceId?.trim();
    const spaceOwnerUserId =
      spaceId && getVerifiedSpaceOwner
        ? await getVerifiedSpaceOwner({
            principalType: input.auth.principalType,
            spaceId,
            tenantId: input.auth.tenantId,
            triggerId: input.auth.triggerId?.trim() || null,
          })
        : null;
    const allCandidates = await repo.listCandidateConnections({
      connectorId: connector.id,
      principalId: input.auth.principalId,
      tenantId: input.auth.tenantId,
      ...(agentGrants ? { agentGrantedConnectionIds: agentGrants } : {}),
      ...(spaceOwnerUserId ? { spaceOwnerUserId } : {}),
    });
    // CN.3 — the WHERE axis. Mounts name accounts, so a space that works
    // info@company.com cannot reach a colleague's mailbox on the same
    // connector. Applied as an intersection over candidates the principal may
    // already use, which is what makes it safe to take the space id from the
    // request: it can only remove.
    const mounted =
      spaceId && getMountedConnectionAccess
        ? await getMountedConnectionAccess({
            spaceId,
            tenantId: input.auth.tenantId,
          })
        : null;
    const candidates = mounted
      ? allCandidates.filter((c) => mounted.has(c.id))
      : allCandidates;
    // Named the space rather than saying "no account found": C3a's lesson is
    // that silent narrowing produces a confident wrong diagnosis — asked to
    // send mail, an agent told the user the connector had no tool at all. The
    // account may well be connected; it is simply not part of this space.
    if (allCandidates.length > 0 && candidates.length === 0) {
      return {
        action: "deny",
        reason:
          `connection_not_in_space: no ${connector.name} account is available in this space, ` +
          "though one is connected for the team. This is a property of the space, not a temporary failure — " +
          "do not retry. Say so, and that the account can be added in the space's connections settings.",
      };
    }
    // Same selection the operation handler runs (shared resolver): the gate
    // must evaluate policy on the exact connection the call will use.
    const rawAccount =
      input.input && typeof input.input === "object"
        ? (input.input as { account?: unknown }).account
        : undefined;
    const selection = selectConnectionForAccount({
      account: typeof rawAccount === "string" ? rawAccount : null,
      candidates,
    });
    if (!selection.ok) {
      return {
        action: "deny",
        reason: `${selection.code}: ${describeSelectionFailure(selection, connector.name)}`,
      };
    }
    const connection = selection.connection;
    const overrides = await repo.listPolicyOverrides([connection.id]);
    const resolved = resolveConnectionActionPolicy({
      action: { group: action.group as ConnectorActionGroup, id: action.id },
      connection,
      actsForSpaceOwner:
        spaceOwnerUserId !== null &&
        connection.owner_user_id === spaceOwnerUserId,
      hasAgentGrant: agentGrants?.has(connection.id) ?? false,
      isAutonomous,
      overrides,
      principal: {
        principalId: input.auth.principalId,
        principalType: input.auth.principalType,
      },
      // B1 — how far THIS space goes with THIS account. Absent when the run
      // has no space, and null when the space never chose a level; both leave
      // the account's own `autonomous_mode` to decide, as before.
      spaceAccess: mounted?.get(connection.id) ?? null,
    });
    if (resolved.decision === "deny") {
      return { action: "deny", reason: resolved.reason };
    }
    if (resolved.decision === "allow") {
      return { action: "allow", reason: "connection_policy_allow" };
    }
    // decision === "ask"
    if (!isAutonomous) {
      // Live user context: the AI pre-gate owns the approval UX via the
      // static contract; core stays permissive for user principals.
      return null;
    }
    // Core's approval gate takes it from here: consume a standing grant or
    // file ONE deduped request in core.approval_requests (and emit
    // `approval.requested`). This policy used to write a request row of its
    // own here — a second ledger nobody consumed, filed even when a grant let
    // the call through. The context rides along so the approvals UI can say
    // which connection the ask resolved to.
    return {
      action: "require_approval",
      approvalContext: {
        action_id: action.id,
        connection_id: connection.id,
        connector_id: connector.id,
        // CN.6/3 — WHO may answer this. The reason string below has always
        // claimed the request went to the connection owner, while the decision
        // route checked only the tenant: any colleague could approve an agent
        // sending mail from someone else's mailbox. Core restricts on this
        // field; the module supplies it because ownership is the module's fact.
        owner_user_id: connection.owner_user_id,
      },
      reason:
        "connection_approval_pending: a human must approve this action; the request was sent to the connection owner",
    };
  };
}
