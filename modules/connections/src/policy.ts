import type {
  ConnectionsRepo,
  ConnectorActionGroup,
} from "@engenty/connections-sdk";
import {
  connectorScopeAllows,
  connectorScopeDenialReason,
  describeSelectionFailure,
  isAccountReachableInRun,
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
 * - `deny` clamps (autonomous mode, user-configured deny, and an account the
 *   run's Space does not own — PLAN-space-owned-connections.md) are enforced
 *   for every principal.
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
   * May this call use the Space it names? The header picks whose accounts a
   * call reaches, so it is verified (`mayUseSpaceInRun`), never trusted.
   */
  mayUseSpace: (
    auth: PluginPolicyInput["auth"],
    spaceId: string
  ) => Promise<boolean>
): PluginProfilePolicy {
  return async (input: PluginPolicyInput) => {
    const match = resolveConnectorOperation(
      input.operationId,
      input.auth.tenantId
    );
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
    // A connection is always some Space's: a run that names none reaches no
    // account, and guessing which Space it meant would be the leak.
    const spaceId = input.auth.spaceId?.trim();
    if (!spaceId) {
      return {
        action: "deny",
        reason:
          `connection_not_in_space: ${connector.name} accounts belong to a space, and this call runs outside one. ` +
          "This is not a temporary failure — do not retry. Say so, and that the account is used from inside the space it was connected in.",
      };
    }
    if (!(await mayUseSpace(input.auth, spaceId))) {
      return {
        action: "deny",
        reason:
          "connection_not_in_space: this call may not use the accounts of the space it names. " +
          "Do not retry. Say that the account belongs to a space this run is not part of.",
      };
    }
    const repo = getRepo({ tenantId: input.auth.tenantId });
    const candidates = (
      await repo.listCandidateConnections({
        connectorId: connector.id,
        spaceId,
        tenantId: input.auth.tenantId,
      })
    ).filter((c) => isAccountReachableInRun({ connection: c, spaceId }));
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
      isAutonomous,
      overrides,
      principal: {
        principalId: input.auth.principalId,
        principalType: input.auth.principalType,
      },
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
        // WHO may answer this: the owners of the Space that owns the account
        // (plus tenant admins). Core restricts the decision on this field; the
        // module supplies it because the account's Space is the module's fact.
        space_id: connection.space_id,
      },
      reason:
        "connection_approval_pending: a human must approve this action; the request was sent to the owners of the connection's space",
    };
  };
}
