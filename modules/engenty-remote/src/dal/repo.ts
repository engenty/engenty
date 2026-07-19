// module_remote data access — service-role client, schema-qualified.
// Handlers enforce tenant scoping here (RLS is service-role-only by design).

import { randomBytes } from "node:crypto";
import type {
  RemoteBindingRow,
  RemoteIdentityRow,
  RemotePairingRequestRow,
  RemotePlatform,
} from "../schema/types.js";

const SCHEMA = "module_remote";

// Minimal structural supabase-js surface (mirrors slack-bridge's usage; avoids
// a hard @supabase/supabase-js type dependency in the module).
export interface RemoteDbClient {
  schema(name: string): {
    from(table: string): any;
  };
}

function table(supabase: RemoteDbClient, name: string) {
  return supabase.schema(SCHEMA).from(name);
}

function throwOn(error: { message: string } | null, what: string): void {
  if (error) {
    throw new Error(`engenty-remote ${what} failed: ${error.message}`);
  }
}

// ── Bindings ─────────────────────────────────────────────────────────────────

export async function listBindings(
  supabase: RemoteDbClient,
  tenantId: string
): Promise<RemoteBindingRow[]> {
  const { data, error } = await table(supabase, "bindings")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  throwOn(error, "bindings list");
  return (data ?? []) as RemoteBindingRow[];
}

/**
 * Resolve the binding for an inbound platform event. Tenant is UNKNOWN at this
 * point — the binding IS the tenant resolution. Preference order: exact
 * workspace match, then a single platform-wide binding without workspace
 * anchor (Tier-B single-tenant deployments).
 */
export async function resolveBindingForEvent(
  supabase: RemoteDbClient,
  input: { platform: RemotePlatform; externalWorkspaceId?: string | null }
): Promise<RemoteBindingRow | null> {
  if (input.externalWorkspaceId) {
    const { data, error } = await table(supabase, "bindings")
      .select("*")
      .eq("platform", input.platform)
      .eq("external_workspace_id", input.externalWorkspaceId)
      .eq("status", "active")
      .maybeSingle();
    throwOn(error, "binding workspace lookup");
    if (data) {
      return data as RemoteBindingRow;
    }
  }
  const { data, error } = await table(supabase, "bindings")
    .select("*")
    .eq("platform", input.platform)
    .is("external_workspace_id", null)
    .eq("status", "active");
  throwOn(error, "binding platform lookup");
  const rows = (data ?? []) as RemoteBindingRow[];
  // Ambiguous (several tenants bound without workspace anchor) = no match;
  // never guess a tenant.
  return rows.length === 1 ? (rows[0] ?? null) : null;
}

export async function upsertBinding(
  supabase: RemoteDbClient,
  tenantId: string,
  input: {
    id?: string;
    platform: RemotePlatform;
    agent_id?: string;
    connection_id?: string | null;
    external_workspace_id?: string | null;
    display_name?: string | null;
    unmapped_sender_policy?: "ignore" | "invite" | "deny";
    status?: "active" | "disabled";
    settings?: Record<string, unknown>;
  }
): Promise<RemoteBindingRow> {
  const row = {
    ...(input.id ? { id: input.id } : {}),
    agent_id: input.agent_id ?? "engenty.remote",
    connection_id: input.connection_id ?? null,
    display_name: input.display_name ?? null,
    external_workspace_id: input.external_workspace_id ?? null,
    platform: input.platform,
    settings: input.settings ?? {},
    status: input.status ?? "active",
    tenant_id: tenantId,
    unmapped_sender_policy: input.unmapped_sender_policy ?? "invite",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await table(supabase, "bindings")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  throwOn(error, "binding upsert");
  return data as RemoteBindingRow;
}

export async function deleteBinding(
  supabase: RemoteDbClient,
  tenantId: string,
  bindingId: string
): Promise<void> {
  const { error } = await table(supabase, "bindings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", bindingId);
  throwOn(error, "binding delete");
}

// ── Identities ───────────────────────────────────────────────────────────────

export async function resolveIdentity(
  supabase: RemoteDbClient,
  input: {
    tenantId: string;
    platform: RemotePlatform;
    externalUserId: string;
  }
): Promise<RemoteIdentityRow | null> {
  const { data, error } = await table(supabase, "identities")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("platform", input.platform)
    .eq("external_user_id", input.externalUserId)
    .maybeSingle();
  throwOn(error, "identity resolve");
  return (data ?? null) as RemoteIdentityRow | null;
}

export async function listIdentities(
  supabase: RemoteDbClient,
  tenantId: string
): Promise<RemoteIdentityRow[]> {
  const { data, error } = await table(supabase, "identities")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  throwOn(error, "identities list");
  return (data ?? []) as RemoteIdentityRow[];
}

export async function revokeIdentity(
  supabase: RemoteDbClient,
  tenantId: string,
  identityId: string
): Promise<void> {
  const { error } = await table(supabase, "identities")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", identityId);
  throwOn(error, "identity revoke");
}

// ── Pairing ──────────────────────────────────────────────────────────────────

const PAIRING_TTL_MS = 15 * 60_000;

export function generatePairingCode(): string {
  // URL-safe, unguessable, short enough for a chat link.
  return randomBytes(18).toString("base64url");
}

/**
 * Create (or refresh) the open pairing request for a sender. Refreshing keeps
 * one live code per sender per binding — a re-invite invalidates the old link.
 */
export async function upsertOpenPairingRequest(
  supabase: RemoteDbClient,
  input: {
    tenantId: string;
    bindingId: string;
    platform: RemotePlatform;
    externalUserId: string;
    displayName?: string | null;
  }
): Promise<RemotePairingRequestRow> {
  // Delete any open request first (partial unique index blocks a second open
  // row; upsert can't target a partial index portably via supabase-js).
  const { error: clearError } = await table(supabase, "pairing_requests")
    .delete()
    .eq("binding_id", input.bindingId)
    .eq("external_user_id", input.externalUserId)
    .is("claimed_at", null);
  throwOn(clearError, "pairing clear");

  const { data, error } = await table(supabase, "pairing_requests")
    .insert({
      binding_id: input.bindingId,
      code: generatePairingCode(),
      display_name: input.displayName ?? null,
      expires_at: new Date(Date.now() + PAIRING_TTL_MS).toISOString(),
      external_user_id: input.externalUserId,
      platform: input.platform,
      tenant_id: input.tenantId,
    })
    .select("*")
    .single();
  throwOn(error, "pairing insert");
  return data as RemotePairingRequestRow;
}

export async function findPairingByCode(
  supabase: RemoteDbClient,
  code: string
): Promise<RemotePairingRequestRow | null> {
  const { data, error } = await table(supabase, "pairing_requests")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  throwOn(error, "pairing lookup");
  return (data ?? null) as RemotePairingRequestRow | null;
}

/**
 * Claim a pairing code for the calling user: marks the request claimed and
 * creates the verified identity row. Caller must have checked tenant match.
 */
export async function claimPairing(
  supabase: RemoteDbClient,
  request: RemotePairingRequestRow,
  userId: string
): Promise<RemoteIdentityRow> {
  const now = new Date().toISOString();
  const { error: claimError } = await table(supabase, "pairing_requests")
    .update({ claimed_at: now, claimed_by: userId })
    .eq("id", request.id)
    .is("claimed_at", null);
  throwOn(claimError, "pairing claim");

  const { data, error } = await table(supabase, "identities")
    .upsert(
      {
        display_name: request.display_name,
        external_user_id: request.external_user_id,
        platform: request.platform,
        tenant_id: request.tenant_id,
        user_id: userId,
        verified_at: now,
      },
      { onConflict: "tenant_id,platform,external_user_id" }
    )
    .select("*")
    .single();
  throwOn(error, "identity create");
  return data as RemoteIdentityRow;
}

// ── Inbound dedup ────────────────────────────────────────────────────────────

/** Returns true when this event id is fresh (first time seen). */
export async function recordInboundEvent(
  supabase: RemoteDbClient,
  bindingId: string,
  externalEventId: string
): Promise<boolean> {
  const { error } = await table(supabase, "inbound_events").insert({
    binding_id: bindingId,
    external_event_id: externalEventId,
  });
  if (error) {
    if (String(error.message).includes("duplicate key")) {
      return false;
    }
    throw new Error(`engenty-remote inbound dedup failed: ${error.message}`);
  }
  return true;
}
