import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ApiTokenRecord,
  AuthStores,
  DeviceAuthorizationRecord,
  ServiceCredentialRecord,
  SessionRecord,
} from "./types.js";

type Row = Record<string, unknown>;

function toEpoch(value: unknown): number {
  return value ? Math.floor(new Date(String(value)).getTime() / 1000) : 0;
}

function toIso(epochSeconds: number | undefined): string | null {
  return epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null;
}

function deviceFromRow(row: Row): DeviceAuthorizationRecord {
  const requested = (row.requested ?? {}) as Partial<
    DeviceAuthorizationRecord["requested"]
  >;
  return {
    approvedAt: row.approved_at ? toEpoch(row.approved_at) : undefined,
    approvedBy: (row.approved_by as string | null) ?? undefined,
    approvedTenantId: (row.approved_tenant as string | null) ?? undefined,
    clientName: (row.client_name as string | null) ?? undefined,
    createdAt: toEpoch(row.created_at),
    deviceCodeHash: String(row.device_code_hash),
    expiresAt: toEpoch(row.expires_at),
    granted: (row.granted as DeviceAuthorizationRecord["granted"]) ?? undefined,
    lastPolledAt: row.last_polled_at ? toEpoch(row.last_polled_at) : undefined,
    requested: {
      capabilities: requested.capabilities ?? [],
      moduleIds: requested.moduleIds ?? [],
      scopes: requested.scopes ?? [],
    },
    status: row.status as DeviceAuthorizationRecord["status"],
    userCode: String(row.user_code),
  };
}

function deviceToRow(record: Partial<DeviceAuthorizationRecord>): Row {
  const row: Row = {};
  if (record.deviceCodeHash !== undefined) {
    row.device_code_hash = record.deviceCodeHash;
  }
  if (record.userCode !== undefined) {
    row.user_code = record.userCode;
  }
  if (record.status !== undefined) {
    row.status = record.status;
  }
  if (record.requested !== undefined) {
    row.requested = record.requested;
  }
  if (record.granted !== undefined) {
    row.granted = record.granted;
  }
  if (record.clientName !== undefined) {
    row.client_name = record.clientName;
  }
  if (record.approvedBy !== undefined) {
    row.approved_by = record.approvedBy;
  }
  if (record.approvedTenantId !== undefined) {
    row.approved_tenant = record.approvedTenantId;
  }
  if (record.approvedAt !== undefined) {
    row.approved_at = toIso(record.approvedAt);
  }
  if (record.lastPolledAt !== undefined) {
    row.last_polled_at = toIso(record.lastPolledAt);
  }
  if (record.createdAt !== undefined) {
    row.created_at = toIso(record.createdAt);
  }
  if (record.expiresAt !== undefined) {
    row.expires_at = toIso(record.expiresAt);
  }
  return row;
}

function sessionFromRow(row: Row): SessionRecord {
  return {
    createdAt: toEpoch(row.created_at),
    expiresAt: toEpoch(row.expires_at),
    id: String(row.id),
    principalId: String(row.principal_id),
    refreshTokenHash: String(row.refresh_token_hash),
    refreshTokenId: String(row.refresh_token_id),
    revokedAt: row.revoked_at ? toEpoch(row.revoked_at) : undefined,
    tenantId: String(row.tenant_id),
  };
}

function sessionToRow(record: Partial<SessionRecord>): Row {
  const row: Row = {};
  if (record.id !== undefined) {
    row.id = record.id;
  }
  if (record.principalId !== undefined) {
    row.principal_id = record.principalId;
  }
  if (record.tenantId !== undefined) {
    row.tenant_id = record.tenantId;
  }
  if (record.refreshTokenId !== undefined) {
    row.refresh_token_id = record.refreshTokenId;
  }
  if (record.refreshTokenHash !== undefined) {
    row.refresh_token_hash = record.refreshTokenHash;
  }
  if (record.createdAt !== undefined) {
    row.created_at = toIso(record.createdAt);
  }
  if (record.expiresAt !== undefined) {
    row.expires_at = toIso(record.expiresAt);
  }
  if (record.revokedAt !== undefined) {
    row.revoked_at = toIso(record.revokedAt);
  }
  return row;
}

function apiTokenFromRow(row: Row): ApiTokenRecord {
  return {
    capabilities: (row.capabilities as string[]) ?? [],
    createdAt: toEpoch(row.created_at),
    expiresAt: toEpoch(row.expires_at),
    id: String(row.id),
    last4: String(row.last4 ?? ""),
    moduleIds: (row.module_ids as string[]) ?? [],
    name: String(row.name ?? ""),
    principalId: String(row.principal_id),
    principalType: row.principal_type === "service" ? "service" : "agent",
    revokedAt: row.revoked_at ? toEpoch(row.revoked_at) : undefined,
    scopes: (row.scopes as string[]) ?? [],
    tenantId: String(row.tenant_id),
    tokenHash: String(row.token_hash),
  };
}

function apiTokenToRow(record: ApiTokenRecord): Row {
  return {
    capabilities: record.capabilities,
    created_at: toIso(record.createdAt),
    expires_at: toIso(record.expiresAt),
    id: record.id,
    last4: record.last4,
    module_ids: record.moduleIds,
    name: record.name,
    principal_id: record.principalId,
    principal_type: record.principalType,
    scopes: record.scopes,
    tenant_id: record.tenantId,
    token_hash: record.tokenHash,
  };
}

function serviceCredentialFromRow(row: Row): ServiceCredentialRecord {
  return {
    capabilities: (row.capabilities as string[]) ?? [],
    createdAt: toEpoch(row.created_at),
    disabledAt: row.disabled_at ? toEpoch(row.disabled_at) : undefined,
    id: String(row.id),
    lastUsedAt: row.last_used_at ? toEpoch(row.last_used_at) : undefined,
    name: String(row.name ?? ""),
    secretHash: String(row.secret_hash),
    tenantId: row.tenant_id === null ? null : String(row.tenant_id),
  };
}

function serviceCredentialToRow(record: ServiceCredentialRecord): Row {
  return {
    capabilities: record.capabilities,
    created_at: toIso(record.createdAt),
    disabled_at: toIso(record.disabledAt),
    id: record.id,
    last_used_at: toIso(record.lastUsedAt),
    name: record.name,
    secret_hash: record.secretHash,
    tenant_id: record.tenantId,
  };
}

export function createSupabaseAuthStores(client: SupabaseClient): AuthStores {
  const core = () => client.schema("core");
  return {
    apiTokens: {
      async get(id) {
        const { data } = await core()
          .from("api_tokens")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        return data ? apiTokenFromRow(data) : null;
      },
      async insert(record) {
        const { error } = await core()
          .from("api_tokens")
          .insert(apiTokenToRow(record));
        if (error) {
          throw new Error(`api_tokens insert: ${error.message}`);
        }
      },
      async listForPrincipal(tenantId, principalId) {
        const { data } = await core()
          .from("api_tokens")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("principal_id", principalId);
        return (data ?? []).map(apiTokenFromRow);
      },
      async listRevokedIds() {
        const { data } = await core()
          .from("api_tokens")
          .select("id, expires_at")
          .not("revoked_at", "is", null)
          .gt("expires_at", new Date().toISOString());
        return (data ?? []).map((row) => ({
          expiresAt: toEpoch(row.expires_at),
          id: String(row.id),
        }));
      },
      async revoke(id) {
        const { error } = await core()
          .from("api_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", id);
        if (error) {
          throw new Error(`api_tokens revoke: ${error.message}`);
        }
      },
    },
    devices: {
      async getByCodeHash(deviceCodeHash) {
        const { data } = await core()
          .from("device_authorizations")
          .select("*")
          .eq("device_code_hash", deviceCodeHash)
          .maybeSingle();
        return data ? deviceFromRow(data) : null;
      },
      async getPendingByUserCode(userCode) {
        const { data } = await core()
          .from("device_authorizations")
          .select("*")
          .eq("user_code", userCode)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        return data ? deviceFromRow(data) : null;
      },
      async insert(record) {
        const { error } = await core()
          .from("device_authorizations")
          .insert(deviceToRow(record));
        if (error) {
          throw new Error(`device_authorizations insert: ${error.message}`);
        }
      },
      async update(deviceCodeHash, patch) {
        const { error } = await core()
          .from("device_authorizations")
          .update(deviceToRow(patch))
          .eq("device_code_hash", deviceCodeHash);
        if (error) {
          throw new Error(`device_authorizations update: ${error.message}`);
        }
      },
    },
    serviceCredentials: {
      async get(id) {
        const { data } = await core()
          .from("service_credential")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        return data ? serviceCredentialFromRow(data) : null;
      },
      async insert(record) {
        const { error } = await core()
          .from("service_credential")
          .insert(serviceCredentialToRow(record));
        if (error) {
          throw new Error(`service_credential insert: ${error.message}`);
        }
      },
      async listForTenant(tenantId) {
        const { data } = await core()
          .from("service_credential")
          .select("*")
          .eq("tenant_id", tenantId);
        return (data ?? []).map(serviceCredentialFromRow);
      },
      async revoke(id) {
        const { error } = await core()
          .from("service_credential")
          .update({ disabled_at: new Date().toISOString() })
          .eq("id", id);
        if (error) {
          throw new Error(`service_credential revoke: ${error.message}`);
        }
      },
      async touch(id, atEpochSeconds) {
        // Best-effort: a failed last_used_at write must never fail the
        // exchange the caller is actually waiting on.
        await core()
          .from("service_credential")
          .update({ last_used_at: toIso(atEpochSeconds) })
          .eq("id", id);
      },
    },
    sessions: {
      async get(sessionId) {
        const { data } = await core()
          .from("sessions")
          .select("*")
          .eq("id", sessionId)
          .maybeSingle();
        return data ? sessionFromRow(data) : null;
      },
      async insert(record) {
        const { error } = await core()
          .from("sessions")
          .insert(sessionToRow(record));
        if (error) {
          throw new Error(`sessions insert: ${error.message}`);
        }
      },
      async listForPrincipal(tenantId, principalId) {
        const { data } = await core()
          .from("sessions")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("principal_id", principalId);
        return (data ?? []).map(sessionFromRow);
      },
      async update(sessionId, patch) {
        const { error } = await core()
          .from("sessions")
          .update(sessionToRow(patch))
          .eq("id", sessionId);
        if (error) {
          throw new Error(`sessions update: ${error.message}`);
        }
      },
    },
  };
}

/** Build stores from config/env; falls back to memory when Supabase is absent. */
export function createSupabaseClientFromConfig(
  config: Record<string, unknown>
): SupabaseClient | null {
  const url = String(config.supabaseUrl ?? process.env.SUPABASE_URL ?? "");
  const key = String(
    config.supabaseServiceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );
  if (!(url && key)) {
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
