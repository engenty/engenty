import type { SupabaseClient } from "@supabase/supabase-js";
import { createConnectorClientEnv } from "./client-env-resolver.js";
import { ConnectionsActionError } from "./errors.js";
import { executeConnectorAction } from "./execute.js";
import type { ClientEnvResolver } from "./oauth2.js";
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
  ConnectorFileEntry,
  ConnectorFilesListResult,
  ConnectorFilesReadResult,
  StreamPullResult,
} from "./types.js";

/** A file-capable connection, enriched with connector display metadata. */
export interface FileSourceConnection extends ConnectionSummary {
  connector_icon: string | null;
  connector_name: string;
}

export interface ModuleFilesListParams {
  connectionId: string;
  cursor?: string | null;
  folderRef: string | null;
  limit?: number;
  principal: ConnectionPolicyPrincipal;
  tenantId: string;
}

export interface ModuleFilesReadParams {
  connectionId: string;
  fileRef: string;
  maxBytes?: number;
  principal: ConnectionPolicyPrincipal;
  tenantId: string;
}

export interface ModuleFilesStatParams {
  connectionId: string;
  principal: ConnectionPolicyPrincipal;
  ref: string;
  tenantId: string;
}

/**
 * Write params for the storage capability (PLAN-space-data-agent-crud P2.2).
 *
 * `contentBase64` XOR `contentText` — the synthesized action's handler enforces
 * exactly one, so sending both is an error rather than a precedence puzzle.
 */
export interface ModuleFilesWriteParams {
  connectionId: string;
  contentBase64?: string;
  contentText?: string;
  folderRef: string | null;
  mimeType?: string | null;
  name: string;
  principal: ConnectionPolicyPrincipal;
  tenantId: string;
}

export interface ModuleFilesDeleteParams {
  connectionId: string;
  principal: ConnectionPolicyPrincipal;
  ref: string;
  tenantId: string;
}

export interface ModuleFilesMoveParams {
  connectionId: string;
  newName?: string;
  principal: ConnectionPolicyPrincipal;
  ref: string;
  tenantId: string;
  toFolderRef: string | null;
}

export interface ConnectionsModuleClientOptions {
  /**
   * Tenant-aware OAuth client-credential resolver for token refresh (so a
   * tenant's own OAuth app is used). Auto-built by
   * {@link createConnectionsModuleClient} from its `serviceDb`; omit on the
   * from-repo variant to fall back to process.env.
   */
  clientEnv?: (tenantId: string | null) => ClientEnvResolver;
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

/** DB handles for {@link createConnectionsModuleClient} (Phase A seam). */
export interface ConnectionsModuleClientDb {
  /**
   * Tenant-locked handle factory (engenty_server lane, RLS-enforced). Every
   * tenant-row path — connection/account listing, policy reads, token
   * refresh writes — resolves a repo on `getDb({ tenantId })` per call, so
   * the database itself confines each call to the caller's tenant.
   */
  getDb: (auth: { tenantId: string }) => SupabaseClient;
  /**
   * Service-role client — feeds ONLY the OAuth client-credential resolver:
   * platform-level settings rows carry tenant_id NULL, which the tenant lane
   * cannot see by design (platform settings are core service-lane work; the
   * resolver is tenant-parameterized per lookup).
   */
  serviceDb: SupabaseClient;
}

/**
 * Sanctioned server-side consumption API for modules (inbox, KB, customer
 * care): the same consent rules as the gateway path — policy is NOT bypassed,
 * `isAutonomous: true` enforces the autonomous clamps and turns `ask` into a
 * durable approval request surfaced as a typed `ConnectionsActionError`.
 */
export function createConnectionsModuleClient(
  db: ConnectionsModuleClientDb,
  options: ConnectionsModuleClientOptions
) {
  return createConnectionsModuleClientFromRepo(
    (tenantId) => createConnectionsRepo(db.getDb({ tenantId })),
    {
      clientEnv: createConnectorClientEnv(db.serviceDb),
      ...options,
    }
  );
}

/**
 * Same client over a per-tenant repo factory (module composition, tests).
 * Every method carries a `tenantId` and resolves its repo through `getRepo`
 * at call time — nothing tenant-shaped is captured at construction.
 */
export function createConnectionsModuleClientFromRepo(
  getRepo: (tenantId: string) => ConnectionsRepo,
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

  const client = {
    /** Active connections of the tenant (optionally one connector). */
    async listConnections(params: {
      connectorId?: string;
      tenantId: string;
    }): Promise<ConnectionSummary[]> {
      const all = await getRepo(params.tenantId).listConnections(params);
      return all.filter((c) => c.status === "active");
    },

    /**
     * Connection ids granted to the acting agent (PLAN-spaces.md CN.5).
     *
     * `agentId` is the core.agents principal uuid — the value the grant rows
     * store and the one `PluginAuthContext.agentId` carries. Consumers use it
     * to treat a granted personal account as visible in agent-driven calls,
     * the same rule the action policy already applies at execution.
     */
    async listAgentGrantedConnectionIds(params: {
      agentId: string;
      tenantId: string;
    }): Promise<Set<string>> {
      return getRepo(params.tenantId).listAgentGrantedConnectionIds({
        agentId: params.agentId,
      });
    },

    /** Active connections whose connector declares the files capability. */
    async listFileSources(params: {
      tenantId: string;
    }): Promise<FileSourceConnection[]> {
      const all = await getRepo(params.tenantId).listConnections({
        tenantId: params.tenantId,
      });
      const sources: FileSourceConnection[] = [];
      for (const connection of all) {
        if (connection.status !== "active") {
          continue;
        }
        const def = getConnectorDefinition(connection.connector_id);
        if (!def?.files) {
          continue;
        }
        sources.push({
          ...connection,
          connector_icon: def.icon ?? null,
          connector_name: def.name,
        });
      }
      return sources;
    },

    /**
     * Does this connection's connector declare `storage` — i.e. can it be
     * written at all?
     *
     * Separate from "may THIS caller write", which the connection's policy
     * decides when they try. This is the prior question, and it has to be
     * answerable without attempting a write: a mount whose provider is
     * read-only should render read-only rather than offer an action that
     * fails.
     */
    async isStorageCapable(params: {
      connectionId: string;
      tenantId: string;
    }): Promise<boolean> {
      const connection = await getRepo(params.tenantId).getConnection({
        connectionId: params.connectionId,
        tenantId: params.tenantId,
      });
      if (!connection) {
        return false;
      }
      return Boolean(getConnectorDefinition(connection.connector_id)?.storage);
    },

    /** List a folder in a file-capable connection (read-gated like any action). */
    async filesList(
      params: ModuleFilesListParams
    ): Promise<ConnectorFilesListResult> {
      return client.callAction({
        actionId: "files_list",
        connectionId: params.connectionId,
        input: {
          cursor: params.cursor ?? null,
          folder_ref: params.folderRef,
          ...(params.limit === undefined ? {} : { limit: params.limit }),
        },
        isAutonomous: false,
        principal: params.principal,
        tenantId: params.tenantId,
      }) as Promise<ConnectorFilesListResult>;
    },

    async filesRead(
      params: ModuleFilesReadParams
    ): Promise<ConnectorFilesReadResult> {
      return client.callAction({
        actionId: "files_read",
        connectionId: params.connectionId,
        input: {
          file_ref: params.fileRef,
          ...(params.maxBytes === undefined
            ? {}
            : { max_bytes: params.maxBytes }),
        },
        isAutonomous: false,
        principal: params.principal,
        tenantId: params.tenantId,
      }) as Promise<ConnectorFilesReadResult>;
    },

    async filesStat(
      params: ModuleFilesStatParams
    ): Promise<ConnectorFileEntry> {
      return client.callAction({
        actionId: "files_stat",
        connectionId: params.connectionId,
        input: { ref: params.ref },
        isAutonomous: false,
        principal: params.principal,
        tenantId: params.tenantId,
      }) as Promise<ConnectorFileEntry>;
    },

    /**
     * Write a file into a connected folder.
     *
     * Calls the SYNTHESIZED `files_write` action, exactly as the read methods
     * call `files_list` — so the connection's own policy, the ask-by-default
     * gate on group `write`, the approval and the audit row all apply without a
     * single line of new gate code. A connector whose definition has no
     * `storage` never had this action synthesized, and the call fails there:
     * "read-only mount" stays a real state rather than becoming a surprise.
     */
    async filesWrite(
      params: ModuleFilesWriteParams
    ): Promise<ConnectorFileEntry> {
      return client.callAction({
        actionId: "files_write",
        connectionId: params.connectionId,
        input: {
          folder_ref: params.folderRef,
          name: params.name,
          ...(params.contentBase64 === undefined
            ? {}
            : { content_base64: params.contentBase64 }),
          ...(params.contentText === undefined
            ? {}
            : { content_text: params.contentText }),
          ...(params.mimeType === undefined
            ? {}
            : { mime_type: params.mimeType }),
        },
        isAutonomous: false,
        principal: params.principal,
        tenantId: params.tenantId,
      }) as Promise<ConnectorFileEntry>;
    },

    /** Delete a file in a connected folder — group `destructive`, ask-by-default. */
    async filesDelete(
      params: ModuleFilesDeleteParams
    ): Promise<{ deleted: boolean; ref: string }> {
      return client.callAction({
        actionId: "files_delete",
        connectionId: params.connectionId,
        input: { ref: params.ref },
        isAutonomous: false,
        principal: params.principal,
        tenantId: params.tenantId,
      }) as Promise<{ deleted: boolean; ref: string }>;
    },

    /** Move and/or rename a file in a connected folder. */
    async filesMove(
      params: ModuleFilesMoveParams
    ): Promise<ConnectorFileEntry> {
      return client.callAction({
        actionId: "files_move",
        connectionId: params.connectionId,
        input: {
          ref: params.ref,
          to_folder_ref: params.toFolderRef,
          ...(params.newName === undefined ? {} : { new_name: params.newName }),
        },
        isAutonomous: false,
        principal: params.principal,
        tenantId: params.tenantId,
      }) as Promise<ConnectorFileEntry>;
    },

    async callAction(params: ModuleCallActionParams): Promise<unknown> {
      const repo = getRepo(params.tenantId);
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
        // Tenant's own OAuth app for token refresh (same resolver pullStream
        // uses; without it refresh silently fell back to process.env only).
        ...(options.clientEnv
          ? { resolveEnv: options.clientEnv(params.tenantId) }
          : {}),
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
      const repo = getRepo(params.tenantId);
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
            if (connector.auth.kind !== "oauth2") {
              throw new Error("connection_credentials_cannot_refresh");
            }
            const refreshed = await refreshAccessToken({
              config: connector.auth.oauth2,
              refreshToken,
              resolveEnv: options.clientEnv?.(params.tenantId),
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
  return client;
}

export type ConnectionsModuleClient = ReturnType<
  typeof createConnectionsModuleClient
>;
