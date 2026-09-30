import {
  type ApprovalRequestRow,
  consumeApprovalGrant,
  createApprovalService,
  getApprovalRequest,
  insertApprovalRequest,
  listApprovalRequestsForModule,
} from "@engenty/approvals-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectionReach } from "./reach.js";
import { listConnectorDefinitions } from "./registry.js";
import { decryptToken, encryptToken } from "./token-crypto.js";
import type {
  ApprovalRequestRecord,
  ConnectionAutonomousMode,
  ConnectionPolicyOverride,
  ConnectionSummary,
  ConnectorAuthKind,
} from "./types.js";

const SCHEMA = "module_connections";

/**
 * Approval requests live in CORE's store (core.approval_requests /
 * core.approval_grants, D2), not in a module table. `module_connections.
 * approval_requests` was this module's own request ledger — request-only, so
 * approving a row closed it without ever unblocking the run that was waiting.
 * The connector-specific columns ride in the core request's `context`; this
 * file maps them back into the record shape the module's UI already speaks.
 */
const APPROVALS_MODULE_ID = "connections";

function toApprovalRequestRecord(
  row: ApprovalRequestRow
): ApprovalRequestRecord {
  const context = (row.context ?? {}) as {
    action_id?: string;
    connection_id?: string;
    input_summary?: Record<string, unknown> | null;
    task_id?: string | null;
  };
  return {
    action_id: context.action_id ?? "",
    connection_id: context.connection_id ?? "",
    created_at: row.created_at,
    decided_at: row.decided_at,
    decided_by: row.decided_by,
    id: row.id,
    input_summary: context.input_summary ?? null,
    operation_id: row.operation_id,
    requested_by: row.actor_id,
    status: row.status,
    task_id: context.task_id ?? null,
    tenant_id: row.tenant_id,
  };
}

const CONNECTION_COLUMNS =
  "id, tenant_id, space_id, owner_user_id, connector_id, connected_by, autonomous_mode, display_name, external_account, granted_scopes, status, error_message, created_at, auth_kind";

interface ConnectionTokenRow {
  access_token_enc: string | null;
  id: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
}

export interface PendingOAuthFlow {
  connector_id: string;
  expires_at: string;
  nonce: string;
  redirect_to: string | null;
  requested_scopes: string[];
  /**
   * The Space the connected account will belong to; null connects a personal
   * account of `user_id`.
   */
  space_id: string | null;
  tenant_id: string;
  user_id: string;
}

/** Who owns an account: a Space, or one person. */
export type ConnectionOwner = { spaceId: string } | { userId: string };

function throwOnError<T>(result: {
  data: T;
  error: { message: string } | null;
}): T {
  if (result.error) {
    throw new Error(`connections repo: ${result.error.message}`);
  }
  return result.data;
}

export function createConnectionsRepo(supabase: SupabaseClient) {
  const db = () => supabase.schema(SCHEMA);

  return {
    async createApprovalRequest(input: {
      actionId: string;
      connectionId: string;
      inputSummary?: Record<string, unknown> | null;
      operationId: string;
      requestedBy: string;
      taskId?: string | null;
      tenantId: string;
    }): Promise<ApprovalRequestRecord> {
      const row = await insertApprovalRequest(supabase, {
        actorId: input.requestedBy,
        context: {
          action_id: input.actionId,
          connection_id: input.connectionId,
          input_summary: input.inputSummary ?? null,
          task_id: input.taskId ?? null,
        },
        // Same waiting period core's own gate gives a request: long enough
        // for the space's owners to find it in tomorrow's inbox.
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        moduleId: APPROVALS_MODULE_ID,
        operationId: input.operationId,
        reason:
          "connection_approval_pending: a human must approve this action; the request was sent to the owners of the connection's space",
        tenantId: input.tenantId,
      });
      return toApprovalRequestRecord(row);
    },

    /**
     * Spend a standing approval for (principal, operation) if one exists —
     * consulted BEFORE filing a request, so a human's "approve" actually
     * unblocks the retried run instead of re-queueing it forever.
     */
    async consumeApprovalGrant(input: {
      operationId: string;
      principalId: string;
      taskId?: string | null;
      tenantId: string;
    }): Promise<boolean> {
      return await consumeApprovalGrant(supabase, {
        actorId: input.principalId,
        moduleId: APPROVALS_MODULE_ID,
        operationId: input.operationId,
        tenantId: input.tenantId,
        ...(input.taskId ? { subjectIds: [input.taskId] } : {}),
      });
    },

    async createPendingFlow(flow: PendingOAuthFlow): Promise<void> {
      throwOnError(await db().from("pending_oauth_flows").insert(flow));
    },

    async consumePendingFlow(nonce: string): Promise<PendingOAuthFlow | null> {
      const rows = throwOnError(
        await db()
          .from("pending_oauth_flows")
          .delete()
          .eq("nonce", nonce)
          .gt("expires_at", new Date().toISOString())
          .select("*")
      ) as PendingOAuthFlow[];
      return rows[0] ?? null;
    },

    async deleteConnection(params: {
      connectionId: string;
      tenantId: string;
    }): Promise<void> {
      throwOnError(
        await db()
          .from("connections")
          .delete()
          .eq("id", params.connectionId)
          .eq("tenant_id", params.tenantId)
      );
    },

    /**
     * Decide via core's approval service so an approval MINTS the grant the
     * blocked run will spend on retry ("allow once" semantics — the grant
     * burns on first use). Returns null when the request was not pending —
     * already decided, expired, or another approver won the race.
     */
    async decideApprovalRequest(params: {
      decidedBy: string;
      id: string;
      status: "approved" | "denied";
      tenantId: string;
    }): Promise<ApprovalRequestRecord | null> {
      const service = createApprovalService(supabase);
      const decided = await service.decide({
        decidedBy: params.decidedBy,
        decision: params.status === "approved" ? "allow_once" : "deny",
        requestId: params.id,
        tenantId: params.tenantId,
      });
      // decide() answers a lost race with the already-decided row; only the
      // caller that actually flipped pending → decided reports success, so a
      // second approver cannot double-fire downstream (grants, re-dispatch).
      if (!decided || decided.decidedBy !== params.decidedBy) {
        return null;
      }
      const row = await getApprovalRequest(supabase, params.id);
      return row ? toApprovalRequestRecord(row) : null;
    },

    async getConnection(params: {
      connectionId: string;
      tenantId: string;
    }): Promise<ConnectionSummary | null> {
      const rows = throwOnError(
        await db()
          .from("connections")
          .select(CONNECTION_COLUMNS)
          .eq("id", params.connectionId)
          .eq("tenant_id", params.tenantId)
      ) as ConnectionSummary[];
      return rows[0] ?? null;
    },

    async getApprovalRequest(
      id: string
    ): Promise<ApprovalRequestRecord | null> {
      const row = await getApprovalRequest(supabase, id);
      return row ? toApprovalRequestRecord(row) : null;
    },

    async listApprovalRequests(params: {
      status?: ApprovalRequestRecord["status"];
      tenantId: string;
    }): Promise<ApprovalRequestRecord[]> {
      // Core's gate files a connector action's request under the CONNECTOR
      // module's provenance (e.g. "connections-google"), not "connections" —
      // the list has to cover the whole family or the approvals UI never
      // shows the requests that actually block runs.
      const rows = await listApprovalRequestsForModule(supabase, {
        moduleId: [
          APPROVALS_MODULE_ID,
          ...listConnectorDefinitions(params.tenantId).map(
            (def) => def.moduleId
          ),
        ],
        tenantId: params.tenantId,
        ...(params.status ? { status: params.status } : {}),
      });
      return rows.map(toApprovalRequestRecord);
    },

    /**
     * Connections in the tenant, or of one owner when `spaceId` or
     * `ownerUserId` is given. On a user-scoped client RLS already limits rows
     * to Spaces the caller belongs to and the caller's own accounts.
     */
    async listConnections(params: {
      connectorId?: string;
      ownerUserId?: string;
      spaceId?: string;
      tenantId: string;
    }): Promise<ConnectionSummary[]> {
      let query = db()
        .from("connections")
        .select(CONNECTION_COLUMNS)
        .eq("tenant_id", params.tenantId)
        .order("created_at", { ascending: true });
      if (params.connectorId) {
        query = query.eq("connector_id", params.connectorId);
      }
      if (params.spaceId) {
        query = query.eq("space_id", params.spaceId);
      }
      if (params.ownerUserId) {
        query = query.eq("owner_user_id", params.ownerUserId);
      }
      return throwOnError(await query) as ConnectionSummary[];
    },

    async listPolicyOverrides(
      connectionIds: string[]
    ): Promise<ConnectionPolicyOverride[]> {
      if (connectionIds.length === 0) {
        return [];
      }
      return throwOnError(
        await db()
          .from("connection_action_policies")
          .select("connection_id, selector, policy")
          .in("connection_id", connectionIds)
      ) as ConnectionPolicyOverride[];
    },

    /**
     * Active connections for a connector within a call's reach: the accounts
     * its Space owns, then the person's own. Either side may be absent.
     */
    async listCandidateConnections(params: {
      connectorId: string;
      reach: ConnectionReach;
      tenantId: string;
    }): Promise<ConnectionSummary[]> {
      const { personalUserId, spaceId } = params.reach;
      const [space, personal] = await Promise.all([
        spaceId
          ? this.listConnections({
              connectorId: params.connectorId,
              spaceId,
              tenantId: params.tenantId,
            })
          : [],
        personalUserId
          ? this.listConnections({
              connectorId: params.connectorId,
              ownerUserId: personalUserId,
              tenantId: params.tenantId,
            })
          : [],
      ]);
      return [...space, ...personal].filter((c) => c.status === "active");
    },

    async setPolicyOverride(params: {
      connectionId: string;
      policy: ConnectionPolicyOverride["policy"] | null;
      selector: string;
    }): Promise<void> {
      if (params.policy === null) {
        throwOnError(
          await db()
            .from("connection_action_policies")
            .delete()
            .eq("connection_id", params.connectionId)
            .eq("selector", params.selector)
        );
        return;
      }
      throwOnError(
        await db().from("connection_action_policies").upsert(
          {
            connection_id: params.connectionId,
            policy: params.policy,
            selector: params.selector,
          },
          { onConflict: "connection_id,selector" }
        )
      );
    },

    async updateConnectionSettings(params: {
      autonomousMode?: ConnectionAutonomousMode;
      connectionId: string;
      displayName?: string | null;
      tenantId: string;
    }): Promise<void> {
      const patch: Record<string, unknown> = {};
      if (params.autonomousMode !== undefined) {
        patch.autonomous_mode = params.autonomousMode;
      }
      if (params.displayName !== undefined) {
        patch.display_name = params.displayName;
      }
      if (Object.keys(patch).length === 0) {
        return;
      }
      throwOnError(
        await db()
          .from("connections")
          .update(patch)
          .eq("id", params.connectionId)
          .eq("tenant_id", params.tenantId)
      );
    },

    /** Flip a connection's status (e.g. browser permission lost → error). */
    async setConnectionStatus(params: {
      connectionId: string;
      errorMessage?: string | null;
      status: "active" | "error" | "revoked";
      tenantId: string;
    }): Promise<void> {
      throwOnError(
        await db()
          .from("connections")
          .update({
            error_message: params.errorMessage ?? null,
            status: params.status,
          })
          .eq("id", params.connectionId)
          .eq("tenant_id", params.tenantId)
      );
    },

    async upsertConnectionWithTokens(input: {
      accessToken: string;
      /** Defaults to `oauth2`. `api_key` stores encrypted credentials JSON. */
      authKind?: ConnectorAuthKind;
      /** Who signed in — audit only. */
      connectedBy: string;
      connectorId: string;
      expiresAt: Date | null;
      externalAccount: string | null;
      grantedScopes: string[];
      /** The Space or the person the account belongs to. */
      owner: ConnectionOwner;
      refreshToken: string | null;
      tenantId: string;
    }): Promise<ConnectionSummary> {
      // One connection per (tenant, owner, connector, external_account) —
      // reconnecting the same account for the same owner replaces tokens
      // (connection id stays stable so downstream cursors survive); a different
      // account inserts a new row. A null-account row (degraded connect where
      // resolveAccount failed) is the replace target for the next connect for
      // the same owner, so degraded connects never strand duplicates.
      const ownerColumns =
        "spaceId" in input.owner
          ? { owner_user_id: null, space_id: input.owner.spaceId }
          : { owner_user_id: input.owner.userId, space_id: null };
      const scoped = throwOnError(
        await ("spaceId" in input.owner
          ? db()
              .from("connections")
              .select(CONNECTION_COLUMNS)
              .eq("space_id", input.owner.spaceId)
          : db()
              .from("connections")
              .select(CONNECTION_COLUMNS)
              .eq("owner_user_id", input.owner.userId)
        )
          .eq("tenant_id", input.tenantId)
          .eq("connector_id", input.connectorId)
      ) as ConnectionSummary[];
      const account = input.externalAccount?.toLowerCase() ?? null;
      const existing = [
        scoped.find(
          (c) =>
            c.external_account !== null &&
            c.external_account.toLowerCase() === account
        ) ?? scoped.find((c) => c.external_account === null),
      ].filter((c): c is ConnectionSummary => c !== undefined);
      const tokenFields = {
        access_token_enc: encryptToken(input.accessToken),
        error_message: null,
        external_account: input.externalAccount,
        granted_scopes: input.grantedScopes,
        ...(input.refreshToken
          ? { refresh_token_enc: encryptToken(input.refreshToken) }
          : {}),
        status: "active" as const,
        token_expires_at: input.expiresAt?.toISOString() ?? null,
      };
      if (existing[0]) {
        throwOnError(
          await db()
            .from("connections")
            .update(tokenFields)
            .eq("id", existing[0].id)
        );
        const updated = await this.getConnection({
          connectionId: existing[0].id,
          tenantId: input.tenantId,
        });
        if (!updated) {
          throw new Error("connections repo: upsert lost the row");
        }
        return updated;
      }
      const rows = throwOnError(
        await db()
          .from("connections")
          .insert({
            auth_kind: input.authKind ?? "oauth2",
            connected_by: input.connectedBy,
            connector_id: input.connectorId,
            ...ownerColumns,
            tenant_id: input.tenantId,
            ...tokenFields,
          })
          .select(CONNECTION_COLUMNS)
      ) as ConnectionSummary[];
      return rows[0];
    },

    /**
     * The ONLY read path for tokens. Refreshes when within the expiry buffer
     * and persists the rotated tokens. Never returns refresh tokens.
     */
    async withFreshAccessToken<T>(
      params: {
        connectionId: string;
        refresh: (refreshToken: string) => Promise<{
          accessToken: string;
          expiresAt: Date | null;
          refreshToken: string | null;
        }>;
      },
      use: (accessToken: string) => Promise<T>
    ): Promise<T> {
      const rows = throwOnError(
        await db()
          .from("connections")
          .select("id, access_token_enc, refresh_token_enc, token_expires_at")
          .eq("id", params.connectionId)
      ) as ConnectionTokenRow[];
      const row = rows[0];
      if (!row?.access_token_enc) {
        throw new Error("connection_has_no_token");
      }
      const bufferMs = 5 * 60 * 1000;
      const expired =
        row.token_expires_at !== null &&
        new Date(row.token_expires_at).getTime() - bufferMs < Date.now();
      if (!expired) {
        return use(decryptToken(row.access_token_enc));
      }
      if (!row.refresh_token_enc) {
        await db()
          .from("connections")
          .update({
            error_message: "token expired, no refresh token",
            status: "error",
          })
          .eq("id", row.id);
        throw new Error("connection_token_expired");
      }
      const refreshed = await params.refresh(
        decryptToken(row.refresh_token_enc)
      );
      throwOnError(
        await db()
          .from("connections")
          .update({
            access_token_enc: encryptToken(refreshed.accessToken),
            ...(refreshed.refreshToken
              ? { refresh_token_enc: encryptToken(refreshed.refreshToken) }
              : {}),
            status: "active",
            token_expires_at: refreshed.expiresAt?.toISOString() ?? null,
          })
          .eq("id", row.id)
      );
      return use(refreshed.accessToken);
    },
  };
}

export type ConnectionsRepo = ReturnType<typeof createConnectionsRepo>;
