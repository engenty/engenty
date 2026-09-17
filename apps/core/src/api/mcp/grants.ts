import type { PluginOperationRisk } from "@engenty/plugin-sdk";

export interface McpClientGrant {
  clientId: string;
  expiresAt?: string | null;
  maxRiskLevel: PluginOperationRisk;
  revokedAt?: string | null;
  spaceIds: string[];
  tenantId: string;
  userId: string;
}

export interface McpGrantStore {
  get(params: {
    clientId: string;
    tenantId: string;
    userId: string;
  }): Promise<McpClientGrant | null>;
  revoke(params: {
    clientId: string;
    tenantId: string;
    userId: string;
  }): Promise<void>;
  upsert(grant: McpClientGrant): Promise<McpClientGrant>;
}

export function createMemoryMcpGrantStore(
  seed: McpClientGrant[] = []
): McpGrantStore {
  const rows = new Map<string, McpClientGrant>();
  for (const grant of seed) {
    rows.set(grantKey(grant), grant);
  }
  return {
    async get(params) {
      const grant = rows.get(grantKey(params));
      if (!grant || grant.revokedAt) {
        return null;
      }
      if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) {
        return null;
      }
      return grant;
    },
    async revoke(params) {
      const existing = rows.get(grantKey(params));
      if (existing) {
        rows.set(grantKey(params), {
          ...existing,
          revokedAt: new Date().toISOString(),
        });
      }
    },
    async upsert(grant) {
      const stored = { ...grant, revokedAt: null };
      rows.set(grantKey(grant), stored);
      return stored;
    },
  };
}

function grantKey(params: {
  clientId: string;
  tenantId: string;
  userId: string;
}): string {
  return `${params.tenantId}:${params.userId}:${params.clientId}`;
}

export function grantAllowsSpace(
  grant: McpClientGrant,
  spaceId: string | undefined
): boolean {
  if (!spaceId) {
    return grant.spaceIds.length === 1;
  }
  return grant.spaceIds.includes(spaceId);
}

interface McpGrantRow {
  client_id: string;
  expires_at: string | null;
  max_risk_level: string | null;
  revoked_at: string | null;
  space_ids: string[] | null;
  tenant_id: string;
  user_id: string;
}

function rowToGrant(row: McpGrantRow): McpClientGrant {
  const maxRiskLevel =
    row.max_risk_level === "low" ||
    row.max_risk_level === "medium" ||
    row.max_risk_level === "high" ||
    row.max_risk_level === "critical"
      ? row.max_risk_level
      : "medium";
  return {
    clientId: row.client_id,
    expiresAt: row.expires_at,
    maxRiskLevel,
    revokedAt: row.revoked_at,
    spaceIds: row.space_ids ?? [],
    tenantId: row.tenant_id,
    userId: row.user_id,
  };
}

/** Service-role store for core.mcp_client_grants. Tests keep using memory. */
export function createSupabaseMcpGrantStore(
  client: import("@supabase/supabase-js").SupabaseClient
): McpGrantStore {
  const table = () => client.schema("core").from("mcp_client_grants");
  return {
    async get(params) {
      const { data, error } = await table()
        .select(
          "client_id, expires_at, max_risk_level, revoked_at, space_ids, tenant_id, user_id"
        )
        .eq("tenant_id", params.tenantId)
        .eq("user_id", params.userId)
        .eq("client_id", params.clientId)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      const grant = rowToGrant(data as McpGrantRow);
      if (grant.revokedAt) {
        return null;
      }
      if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) {
        return null;
      }
      return grant;
    },
    async revoke(params) {
      await table()
        .update({ revoked_at: new Date().toISOString() })
        .eq("tenant_id", params.tenantId)
        .eq("user_id", params.userId)
        .eq("client_id", params.clientId);
    },
    async upsert(grant) {
      const { data, error } = await table()
        .upsert(
          {
            client_id: grant.clientId,
            expires_at: grant.expiresAt ?? null,
            max_risk_level: grant.maxRiskLevel,
            revoked_at: null,
            space_ids: grant.spaceIds,
            tenant_id: grant.tenantId,
            user_id: grant.userId,
          },
          { onConflict: "tenant_id,user_id,client_id" }
        )
        .select(
          "client_id, expires_at, max_risk_level, revoked_at, space_ids, tenant_id, user_id"
        )
        .single();
      if (error || !data) {
        throw new Error(error?.message ?? "mcp_grant_upsert_failed");
      }
      return rowToGrant(data as McpGrantRow);
    },
  };
}
