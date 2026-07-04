import type { SupabaseClient } from "@supabase/supabase-js";
import { ConnectionsActionError } from "./errors.js";
import { executeConnectorAction } from "./execute.js";
import { refreshAccessToken } from "./oauth2.js";
import type { ConnectionPolicyPrincipal } from "./policy.js";
import { resolveConnectionActionPolicy } from "./policy.js";
import { getConnectorDefinition } from "./registry.js";
import type { ConnectionsRepo } from "./repo.js";
import { createConnectionsRepo } from "./repo.js";
import type {
  ApprovalRequestRecord,
  ConnectionSummary,
  ConnectorDefinition,
  StreamPullResult,
} from "./types.js";

export interface ConnectionsModuleClientOptions {
  /** Consuming module id (e.g. `inbox`), recorded on audit events. */
  moduleId: string;
  /** Notify approvers after an autonomous ask created an approval request. */
  onApprovalRequested?: (
    request: ApprovalRequestRecord
  ) => Promise<void> | void;
  recordAuditEvent?: (event: {
    detail: Record<string, unknown>;
    type: string;
  }) => void;
}

export interface ModuleCallActionParams {
  /** Account addressing when `connectionId` is not given. */
  account?: string | null;
  actionId: string;
  /** Direct connection addressing (preferred for background consumers). */
  connectionId?: string;
  /** Required when `connectionId` is not given. */
  connectorId?: string;
  input: unknown;
  /** Background runs ⇒ autonomous clamps apply; ask ⇒ approval request. */
  isAutonomous: boolean;
  principal: ConnectionPolicyPrincipal;
  taskId?: string | null;
  tenantId: string;
}

export interface ModulePullStreamParams {
  connectionId: string;
  cursor: string | null;
  limit?: number;
  /**
   * Acting principal; defaults to the connection owner as a service
   * principal (streams pull on behalf of whoever consented the connection).
   */
  principal?: ConnectionPolicyPrincipal;
  /** Initial backfill window start (ISO timestamp) when cursor is null. */
  since?: string;
  tenantId: string;
}

/**
 * Sanctioned server-side consumption API for modules (inbox, KB, customer
 * care): the same consent rules as the gateway path — policy is NOT bypassed,
 * `isAutonomous: true` enforces the autonomous clamps and turns `ask` into a
 * durable approval request surfaced as a typed `ConnectionsActionError`.
 */
export function createConnectionsModuleClient(
  supabase: SupabaseClient,
  options: ConnectionsModuleClientOptions
) {
  return createConnectionsModuleClientFromRepo(
    createConnectionsRepo(supabase),
    options
  );
}

/** Same client over an existing repo (module composition, tests). */
export function createConnectionsModuleClientFromRepo(
  repo: ConnectionsRepo,
  options: ConnectionsModuleClientOptions
) {
  function requireConnector(connectorId: string): ConnectorDefinition {
    const connector = getConnectorDefinition(connectorId);
    if (!connector) {
      throw new ConnectionsActionError(
        "connection_not_connected",
        `connector ${connectorId} is not installed`
      );
    }
    return connector;
  }

  return {
    /** Active connections of the tenant (optionally one connector). */
    async listConnections(params: {
      connectorId?: string;
      tenantId: string;
    }): Promise<ConnectionSummary[]> {
      const all = await repo.listConnections(params);
      return all.filter((c) => c.status === "active");
    },

    async callAction(params: ModuleCallActionParams): Promise<unknown> {
      let connector: ConnectorDefinition;
      if (params.connectionId) {
        const connection = await repo.getConnection({
          connectionId: params.connectionId,
          tenantId: params.tenantId,
        });
        if (!connection) {
          throw new ConnectionsActionError(
            "connection_not_connected",
            `no connection with id ${params.connectionId}`
          );
        }
        connector = requireConnector(connection.connector_id);
      } else if (params.connectorId) {
        connector = requireConnector(params.connectorId);
      } else {
        throw new Error(
          "connections module client: callAction needs connectionId or connectorId"
        );
      }
      const action = connector.actions.find((a) => a.id === params.actionId);
      if (!action) {
        throw new Error(
          `connections module client: connector ${connector.id} has no action ${params.actionId}`
        );
      }
      const { output } = await executeConnectorAction({
        account: params.account ?? null,
        action,
        ...(params.connectionId ? { connectionId: params.connectionId } : {}),
        connector,
        input: params.input,
        isAutonomous: params.isAutonomous,
        moduleId: options.moduleId,
        ...(options.onApprovalRequested
          ? { onApprovalRequested: options.onApprovalRequested }
          : {}),
        principal: params.principal,
        ...(options.recordAuditEvent
          ? { recordAuditEvent: options.recordAuditEvent }
          : {}),
        repo,
        taskId: params.taskId ?? null,
        tenantId: params.tenantId,
      });
      return output;
    },

    /**
     * Pull the connector's inbound stream. Read-shaped and always autonomous:
     * `autonomous_mode: off` connections are denied, `read_only` suffices.
     * Overridable per connection via the `stream_pull` policy selector.
     */
    async pullStream(
      params: ModulePullStreamParams
    ): Promise<StreamPullResult> {
      const connection = await repo.getConnection({
        connectionId: params.connectionId,
        tenantId: params.tenantId,
      });
      if (connection?.status !== "active") {
        throw new ConnectionsActionError(
          "connection_not_connected",
          `no active connection with id ${params.connectionId}`
        );
      }
      const connector = requireConnector(connection.connector_id);
      const stream = connector.stream;
      if (!stream) {
        throw new ConnectionsActionError(
          "connection_stream_unsupported",
          `connector ${connector.id} does not declare a stream capability`
        );
      }
      const principal: ConnectionPolicyPrincipal = params.principal ?? {
        principalId: connection.owner_user_id ?? "",
        principalType: "service",
      };
      const overrides = await repo.listPolicyOverrides([connection.id]);
      const resolved = resolveConnectionActionPolicy({
        action: { group: "read", id: "stream_pull" },
        connection,
        isAutonomous: true,
        overrides,
        principal,
      });
      if (resolved.decision !== "allow") {
        throw new ConnectionsActionError(
          "connection_denied",
          resolved.decision === "deny"
            ? resolved.reason
            : "stream pull requires an allow policy",
          { connection_id: connection.id }
        );
      }
      const result = await repo.withFreshAccessToken(
        {
          connectionId: connection.id,
          refresh: async (refreshToken) => {
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
        (accessToken) =>
          stream.pull(
            {
              accessToken,
              connection,
              fetchImpl: fetch,
              ...(params.limit === undefined ? {} : { limit: params.limit }),
              log: () => undefined,
              ...(params.since === undefined ? {} : { since: params.since }),
            },
            params.cursor
          )
      );
      options.recordAuditEvent?.({
        detail: {
          connection_id: connection.id,
          consumer_module: options.moduleId,
          item_count: result.items.length,
        },
        type: "connection.stream_pulled",
      });
      return result;
    },
  };
}

export type ConnectionsModuleClient = ReturnType<
  typeof createConnectionsModuleClient
>;
