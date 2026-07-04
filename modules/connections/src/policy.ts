import type {
  ConnectionsRepo,
  ConnectorActionGroup,
} from "@engenty/connections-sdk";
import {
  resolveConnectionActionPolicy,
  resolveConnectorOperation,
} from "@engenty/connections-sdk";
import type {
  PluginPolicyInput,
  PluginProfilePolicy,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "connections-policy" });

export interface ConnectionsPolicyHooks {
  /**
   * Called when an autonomous principal hits an `ask` action: records the
   * durable approval request and notifies approvers. Must be idempotent per
   * (connection, operation, principal) while a request is pending.
   */
  onAutonomousAsk: (params: {
    actionId: string;
    connectionId: string;
    operationId: string;
    requestedBy: string;
    tenantId: string;
  }) => Promise<void>;
}

/**
 * The authoritative gate for connector operations, registered as an async
 * profile policy in core:
 *
 * - `deny` clamps (personal/not-owner, non-owner group cap, autonomous mode,
 *   user-configured deny) are enforced for every principal.
 * - user principals with an `ask` outcome return `null`: live chat approval
 *   stays with the AI-side native suspend/resume pre-gate.
 * - autonomous principals (agent/service): `ask` → require_approval (202) plus
 *   a durable approval request; explicit `allow` overrides return `allow`,
 *   bypassing core's default approval requirement for non-user principals.
 */
export function createConnectionsProfilePolicy(
  repo: ConnectionsRepo,
  hooks: ConnectionsPolicyHooks
): PluginProfilePolicy {
  return async (input: PluginPolicyInput) => {
    const match = resolveConnectorOperation(input.operationId);
    if (!match) {
      return null;
    }
    const { action, connector } = match;
    const isAutonomous = input.auth.principalType !== "user";
    const connection = await repo.resolveConnectionForPrincipal({
      connectorId: connector.id,
      principalId: input.auth.principalId,
      tenantId: input.auth.tenantId,
    });
    if (!connection) {
      return {
        action: "deny",
        reason: `connection_not_connected: ${connector.name} is not connected`,
      };
    }
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
    try {
      await hooks.onAutonomousAsk({
        actionId: action.id,
        connectionId: connection.id,
        operationId: input.operationId,
        requestedBy: input.auth.principalId,
        tenantId: input.auth.tenantId,
      });
    } catch (error) {
      logger.warn("failed to record autonomous approval request", {
        error: error instanceof Error ? error.message : String(error),
        operationId: input.operationId,
      });
    }
    return {
      action: "require_approval",
      reason:
        "connection_approval_pending: a human must approve this action; the request was sent to the connection owner",
    };
  };
}
