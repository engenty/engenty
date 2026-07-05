import {
  describeSelectionFailure,
  selectConnectionForAccount,
} from "./accounts.js";
import { ConnectionsActionError } from "./errors.js";
import { refreshAccessToken } from "./oauth2.js";
import type { ConnectionPolicyPrincipal } from "./policy.js";
import { resolveConnectionActionPolicy } from "./policy.js";
import type { ConnectionsRepo } from "./repo.js";
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
  /** Direct addressing — skips candidate selection (module consumers). */
  connectionId?: string;
  connector: ConnectorDefinition;
  input: unknown;
  /** Background/service context ⇒ autonomous clamps + ask→approval-request. */
  isAutonomous: boolean;
  log?: (msg: string, data?: Record<string, unknown>) => void;
  /** Consuming module id, recorded in the audit event detail. */
  moduleId?: string;
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
  const connection = await resolveTargetConnection(params);

  const overrides = await repo.listPolicyOverrides([connection.id]);
  const resolved = resolveConnectionActionPolicy({
    action,
    connection,
    isAutonomous: params.isAutonomous,
    overrides,
    principal,
  });
  if (resolved.decision === "deny") {
    throw new ConnectionsActionError("connection_denied", resolved.reason, {
      action_id: action.id,
      connection_id: connection.id,
    });
  }
  if (resolved.decision === "ask" && params.isAutonomous) {
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
  params: ExecuteConnectorActionParams
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
  const candidates = await repo.listCandidateConnections({
    connectorId: connector.id,
    principalId: params.principal.principalId,
    tenantId: params.tenantId,
  });
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
