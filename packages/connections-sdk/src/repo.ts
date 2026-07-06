import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "./token-crypto.js";
import type {
  ApprovalRequestRecord,
  ConnectionAutonomousMode,
  ConnectionPolicyOverride,
  ConnectionSharing,
  ConnectionSummary,
  ConnectorActionGroup,
  ConnectorAuthKind,
} from "./types.js";

const SCHEMA = "module_connections";

const CONNECTION_COLUMNS =
  "id, tenant_id, connector_id, owner_user_id, sharing, autonomous_mode, non_owner_max_group, display_name, external_account, granted_scopes, status, error_message, created_at, auth_kind";

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
  sharing: ConnectionSharing;
  tenant_id: string;
  user_id: string;
}

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
      const rows = throwOnError(
        await db()
          .from("approval_requests")
          .insert({
            action_id: input.actionId,
            connection_id: input.connectionId,
            input_summary: input.inputSummary ?? null,
            operation_id: input.operationId,
            requested_by: input.requestedBy,
            status: "pending",
            task_id: input.taskId ?? null,
            tenant_id: input.tenantId,
          })
          .select("*")
      );
      return (rows as ApprovalRequestRecord[])[0];
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

    async decideApprovalRequest(params: {
      decidedBy: string;
      id: string;
      status: "approved" | "denied";
      tenantId: string;
    }): Promise<ApprovalRequestRecord | null> {
      const rows = throwOnError(
        await db()
          .from("approval_requests")
          .update({
            decided_at: new Date().toISOString(),
            decided_by: params.decidedBy,
            status: params.status,
          })
          .eq("id", params.id)
          .eq("tenant_id", params.tenantId)
          .eq("status", "pending")
          .select("*")
      ) as ApprovalRequestRecord[];
      return rows[0] ?? null;
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

    async listApprovalRequests(params: {
      status?: ApprovalRequestRecord["status"];
      tenantId: string;
    }): Promise<ApprovalRequestRecord[]> {
      let query = db()
        .from("approval_requests")
        .select("*")
        .eq("tenant_id", params.tenantId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (params.status) {
        query = query.eq("status", params.status);
      }
      return throwOnError(await query) as ApprovalRequestRecord[];
    },

    async listConnections(params: {
      connectorId?: string;
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
     * All active connections a principal may use for a connector: their own
     * personal connections plus the org-shared ones. Which candidate a call
     * actually uses is decided by `selectConnectionForAccount` (explicit
     * `account` addressing, single-candidate default, ambiguity error).
     */
    async listCandidateConnections(params: {
      connectorId: string;
      principalId: string;
      tenantId: string;
    }): Promise<ConnectionSummary[]> {
      const all = await this.listConnections({
        connectorId: params.connectorId,
        tenantId: params.tenantId,
      });
      return all.filter(
        (c) =>
          c.status === "active" &&
          (c.sharing === "org" || c.owner_user_id === params.principalId)
      );
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
      nonOwnerMaxGroup?: ConnectorActionGroup | null;
      sharing?: ConnectionSharing;
      tenantId: string;
    }): Promise<void> {
      const patch: Record<string, unknown> = {};
      if (params.autonomousMode !== undefined) {
        patch.autonomous_mode = params.autonomousMode;
      }
      if (params.displayName !== undefined) {
        patch.display_name = params.displayName;
      }
      if (params.nonOwnerMaxGroup !== undefined) {
        patch.non_owner_max_group = params.nonOwnerMaxGroup;
      }
      if (params.sharing !== undefined) {
        patch.sharing = params.sharing;
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
      connectorId: string;
      expiresAt: Date | null;
      externalAccount: string | null;
      grantedScopes: string[];
      ownerUserId: string;
      refreshToken: string | null;
      sharing: ConnectionSharing;
      tenantId: string;
    }): Promise<ConnectionSummary> {
      // One connection per (tenant, connector, owner-scope, external_account) —
      // reconnecting the same account replaces tokens (connection id stays
      // stable so downstream cursors survive); a different account inserts a
      // new row. A null-account row (degraded connect where resolveAccount
      // failed) is the replace target for the next connect in the same scope,
      // so degraded connects never strand duplicates.
      let query = db()
        .from("connections")
        .select(CONNECTION_COLUMNS)
        .eq("tenant_id", input.tenantId)
        .eq("connector_id", input.connectorId)
        .eq("sharing", input.sharing);
      if (input.sharing === "personal") {
        query = query.eq("owner_user_id", input.ownerUserId);
      }
      const scoped = throwOnError(await query) as ConnectionSummary[];
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
            connector_id: input.connectorId,
            owner_user_id: input.ownerUserId,
            sharing: input.sharing,
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
