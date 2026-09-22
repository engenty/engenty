import {
  describeSelectionFailure,
  selectConnectionForAccount,
} from "./accounts.js";
import {
  connectorScopeAllows,
  connectorScopeDenialReason,
} from "./capabilities.js";
import { ConnectionsActionError } from "./errors.js";
import type { ClientEnvResolver } from "./oauth2.js";
import { refreshAccessToken } from "./oauth2.js";
import type { ConnectionPolicyPrincipal } from "./policy.js";
import { resolveConnectionActionPolicy } from "./policy.js";
import { isAccountReachableInRun } from "./reach.js";
import type { ConnectionsRepo } from "./repo.js";
import type { SpaceConnectionAccess } from "./space-mounts.js";
import type {
  ApprovalRequestRecord,
  ConnectionSummary,
  ConnectorAction,
  ConnectorDefinition,
} from "./types.js";
import { connectorOperationId } from "./types.js";

export interface ExecuteConnectorActionParams {
  /** Explicit account addressing (matched by `selectConnectionForAccount`). */
  account?: string | null;
  action: ConnectorAction;
  /**
   * The AGENT driving this call (`x-engenty-agent-id`), whose grants may let it
   * reach a personal account it does not own — PLAN-spaces.md CN.5.
   *
   * Resolved here as well as in the profile policy, same doctrine as the
   * capability re-check above: the policy is authoritative, and a caller that
   * arrived without it must reach the same answer rather than a laxer one.
   */
  agentId?: string | null;
  /** Direct addressing — skips candidate selection (module consumers). */
  connectionId?: string;
  connector: ConnectorDefinition;
  input: unknown;
  /** Background/service context ⇒ autonomous clamps + ask→approval-request. */
  isAutonomous: boolean;
  log?: (msg: string, data?: Record<string, unknown>) => void;
  /** Consuming module id, recorded in the audit event detail. */
  moduleId?: string;
  /**
   * The run's space mounts with their levels (CN.3 + B1), when the caller has
   * a space. Candidates are the union of mounted accounts, all-spaces accounts
   * already folded into this map, and agent grants. Null/absent = no space.
   * Direct `connectionId` addressing (module consumers) is not narrowed here;
   * those operations carry their own space policy.
   */
  mountedConnectionAccess?: ReadonlyMap<
    string,
    SpaceConnectionAccess | null
  > | null;
  /** Notify approvers after an ask created a durable approval request. */
  onApprovalRequested?: (
    request: ApprovalRequestRecord
  ) => Promise<void> | void;
  principal: ConnectionPolicyPrincipal;
  recordAuditEvent?: (event: {
    detail: Record<string, unknown>;
    type: string;
  }) => void;
  repo: ConnectionsRepo;
  /** Tenant/platform-aware client-credential resolver for OAuth token refresh. */
  resolveEnv?: ClientEnvResolver;
  /**
   * The VERIFIED personal-space owner this run acts for
   * (PLAN-space-computer.md §2.1) — from `resolveVerifiedSpaceOwnerForRun`,
   * never a raw claim. Widens candidates to the owner's accounts.
   */
  spaceOwnerUserId?: string | null;
  taskId?: string | null;
  tenantId: string;
}

/**
 * The one execution path for connector actions: candidate resolution →
 * policy check → fresh access token → action handler → audit. Used by the
 * projected gateway operations (live principals; the AI pre-gate owns `ask`
 * approvals there) and by `createConnectionsModuleClient` (module consumers;
 * `ask` under `isAutonomous` records an approval request and throws).
 */
export async function executeConnectorAction(
  params: ExecuteConnectorActionParams
): Promise<{ connection: ConnectionSummary; output: unknown }> {
  const { action, connector, principal, repo, tenantId } = params;

  // Defense in depth (CON-02), same doctrine as the policy re-check below: the
  // connections profile policy is authoritative, but a caller that reached
  // here without it must not be able to spend a connector-scoped grant on a
  // connector it does not name.
  if (
    principal.capabilities &&
    !connectorScopeAllows({
      capabilities: principal.capabilities,
      connectorId: connector.id,
      group: action.group,
    })
  ) {
    throw new ConnectionsActionError(
      "connection_denied",
      connectorScopeDenialReason({
        connectorId: connector.id,
        connectorName: connector.name,
        group: action.group,
      }),
      { action_id: action.id, connector_id: connector.id }
    );
  }

  // CN.5 — resolved before the connection, because a granted personal account
  // has to be a CANDIDATE before any policy can be asked about it.
  const agentGrants = params.agentId?.trim()
    ? await repo.listAgentGrantedConnectionIds({
        agentId: params.agentId.trim(),
      })
    : null;
  const connection = await resolveTargetConnection({
    ...params,
    ...(agentGrants ? { agentGrants } : {}),
  });

  const overrides = await repo.listPolicyOverrides([connection.id]);
  const resolved = resolveConnectionActionPolicy({
    action,
    connection,
    actsForSpaceOwner:
      params.spaceOwnerUserId != null &&
      connection.owner_user_id === params.spaceOwnerUserId,
    hasAgentGrant: agentGrants?.has(connection.id) ?? false,
    isAutonomous: params.isAutonomous,
    overrides,
    principal,
    spaceAccess: params.mountedConnectionAccess?.get(connection.id) ?? null,
  });
  if (resolved.decision === "deny") {
    throw new ConnectionsActionError("connection_denied", resolved.reason, {
      action_id: action.id,
      connection_id: connection.id,
    });
  }
  if (resolved.decision === "ask" && params.isAutonomous) {
    // A standing approval unblocks the call — this is what makes a human's
    // "approve" mean something to the retried run. Without this consume, the
    // decided request just closed and the next attempt queued a fresh one.
    const granted = await repo.consumeApprovalGrant({
      operationId: connectorOperationId(connector, action.id),
      principalId: principal.principalId,
      taskId: params.taskId ?? null,
      tenantId,
    });
    if (!granted) {
      const request = await recordApprovalRequest({
        action,
        connection,
        connector,
        principal,
        repo,
        taskId: params.taskId ?? null,
        tenantId,
      });
      if (request) {
        await params.onApprovalRequested?.(request);
      }
      throw new ConnectionsActionError(
        "connection_approval_pending",
        "a human must approve this action; the request was sent to the connection owner",
        { action_id: action.id, connection_id: connection.id }
      );
    }
  }
  // decision "ask" with a live principal proceeds: the AI-side native
  // suspend/resume pre-gate already handled the approval UX upstream.

  const runHandler = (accessToken: string) =>
    Promise.resolve(
      action.handler(params.input, {
        accessToken,
        connection,
        fetchImpl: fetch,
        log: params.log ?? (() => undefined),
      })
    );

  // `browser` connectors hold no server-side secret — the handler bridges into
  // the user's browser, so it runs directly with an empty token. `oauth2` and
  // `api_key` both go through the DAL: oauth2 refreshes on demand; api_key has
  // no expiry, so `withFreshAccessToken` just decrypts the credentials JSON and
  // the refresh closure is never reached.
  const output =
    connector.auth.kind === "browser"
      ? await runHandler("")
      : await repo.withFreshAccessToken(
          {
            connectionId: connection.id,
            refresh: async (refreshToken) => {
              if (connector.auth.kind !== "oauth2") {
                throw new Error("connection_credentials_cannot_refresh");
              }
              const refreshed = await refreshAccessToken({
                config: connector.auth.oauth2,
                refreshToken,
                resolveEnv: params.resolveEnv,
              });
              return {
                accessToken: refreshed.accessToken,
                expiresAt: refreshed.expiresAt,
                refreshToken: refreshed.refreshToken,
              };
            },
          },
          runHandler
        );
  params.recordAuditEvent?.({
    detail: {
      action: action.id,
      connection_id: connection.id,
      ...(params.moduleId ? { consumer_module: params.moduleId } : {}),
    },
    type: "connection.action_executed",
  });
  return { connection, output };
}

async function resolveTargetConnection(
  params: ExecuteConnectorActionParams & {
    /** Pre-resolved agent grants, so this does not re-query per call. */
    agentGrants?: ReadonlySet<string>;
  }
): Promise<ConnectionSummary> {
  const { connector, repo } = params;
  if (params.connectionId) {
    const connection = await repo.getConnection({
      connectionId: params.connectionId,
      tenantId: params.tenantId,
    });
    if (
      !connection ||
      connection.connector_id !== connector.id ||
      connection.status !== "active"
    ) {
      throw new ConnectionsActionError(
        "connection_not_connected",
        `no active ${connector.name} connection with id ${params.connectionId}`,
        { connection_id: params.connectionId }
      );
    }
    return connection;
  }
  const allCandidates = await repo.listCandidateConnections({
    connectorId: connector.id,
    principalId: params.principal.principalId,
    tenantId: params.tenantId,
    ...(params.agentGrants
      ? { agentGrantedConnectionIds: params.agentGrants }
      : {}),
    ...(params.spaceOwnerUserId == null
      ? {}
      : { spaceOwnerUserId: params.spaceOwnerUserId }),
  });
  const mountedIds = params.mountedConnectionAccess
    ? new Set(params.mountedConnectionAccess.keys())
    : null;
  const candidates = allCandidates.filter((c) =>
    isAccountReachableInRun({
      agentGrantedIds: params.agentGrants,
      agentId: params.agentId,
      connection: c,
      mountedIds,
      principalId: params.principal.principalId,
    })
  );
  if (allCandidates.length > 0 && candidates.length === 0) {
    throw new ConnectionsActionError(
      "connection_not_in_space",
      `no ${connector.name} account is available in this space; it can be added in the space's connections settings`,
      { connector_id: connector.id }
    );
  }
  const selection = selectConnectionForAccount({
    account: params.account ?? null,
    candidates,
  });
  if (!selection.ok) {
    throw new ConnectionsActionError(
      selection.code,
      describeSelectionFailure(selection, connector.name),
      { candidates: selection.candidates }
    );
  }
  return selection.connection;
}

/**
 * Durable approval request for an autonomous `ask`, deduped to one pending
 * request per (connection, operation, principal). Returns the new request or
 * null when an identical one is already pending.
 */
async function recordApprovalRequest(params: {
  action: ConnectorAction;
  connection: ConnectionSummary;
  connector: ConnectorDefinition;
  principal: ConnectionPolicyPrincipal;
  repo: ConnectionsRepo;
  taskId: string | null;
  tenantId: string;
}): Promise<ApprovalRequestRecord | null> {
  const operationId = connectorOperationId(params.connector, params.action.id);
  const pending = await params.repo.listApprovalRequests({
    status: "pending",
    tenantId: params.tenantId,
  });
  const exists = pending.some(
    (r) =>
      r.connection_id === params.connection.id &&
      r.operation_id === operationId &&
      r.requested_by === params.principal.principalId
  );
  if (exists) {
    return null;
  }
  return await params.repo.createApprovalRequest({
    actionId: params.action.id,
    connectionId: params.connection.id,
    operationId,
    requestedBy: params.principal.principalId,
    taskId: params.taskId,
    tenantId: params.tenantId,
  });
}
