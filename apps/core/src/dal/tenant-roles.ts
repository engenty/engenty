import type { RoleProfile } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DAL for core.tenant_roles (Phase 7 custom roles). Writes are service-role-only
 * through the core API. role_id is always "custom.<slug>".
 */

export interface TenantRoleRow {
  capabilities: string[];
  created_at: string;
  created_by: string | null;
  description: string | null;
  id: string;
  role_id: string;
  tenant_id: string;
  title: string;
  updated_at: string;
}

function rowToProfile(row: TenantRoleRow): RoleProfile {
  return {
    id: row.role_id,
    title: row.title,
    description: row.description ?? undefined,
    capabilities: row.capabilities,
    system: false,
  };
}

/** Resolve one custom role as a RoleProfile (for the resolveGrants hook). */
export async function getTenantRole(
  db: SupabaseClient,
  tenantId: string,
  roleId: string
): Promise<RoleProfile | undefined> {
  if (!roleId.startsWith("custom.")) {
    return; // only custom.* ids live in this table
  }
  const { data, error } = await db
    .schema("core")
    .from("tenant_roles")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("role_id", roleId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? rowToProfile(data as TenantRoleRow) : undefined;
}

export async function listTenantRoles(
  db: SupabaseClient,
  tenantId: string
): Promise<TenantRoleRow[]> {
  const { data, error } = await db
    .schema("core")
    .from("tenant_roles")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as TenantRoleRow[];
}

export interface UpsertTenantRoleInput {
  capabilities: string[];
  createdBy?: string | null;
  description?: string | null;
  roleId: string;
  tenantId: string;
  title: string;
}

export async function createTenantRole(
  db: SupabaseClient,
  input: UpsertTenantRoleInput
): Promise<TenantRoleRow> {
  const { data, error } = await db
    .schema("core")
    .from("tenant_roles")
    .insert({
      tenant_id: input.tenantId,
      role_id: input.roleId,
      title: input.title,
      description: input.description ?? null,
      capabilities: input.capabilities,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as TenantRoleRow;
}

export async function updateTenantRole(
  db: SupabaseClient,
  input: {
    tenantId: string;
    roleId: string;
    title?: string;
    description?: string | null;
    capabilities?: string[];
  }
): Promise<TenantRoleRow | null> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.title !== undefined) {
    patch.title = input.title;
  }
  if (input.description !== undefined) {
    patch.description = input.description;
  }
  if (input.capabilities !== undefined) {
    patch.capabilities = input.capabilities;
  }
  const { data, error } = await db
    .schema("core")
    .from("tenant_roles")
    .update(patch)
    .eq("tenant_id", input.tenantId)
    .eq("role_id", input.roleId)
    .select("*")
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data as TenantRoleRow | null) ?? null;
}

/**
 * Delete a custom role and any assignments referencing it (role_assignments.
 * role_id is a soft reference into two registries, so there is no FK). Done as
 * two statements app-side.
 */
export async function deleteTenantRole(
  db: SupabaseClient,
  tenantId: string,
  roleId: string
): Promise<void> {
  const del = await db
    .schema("core")
    .from("tenant_roles")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("role_id", roleId);
  if (del.error) {
    throw del.error;
  }
  const delAssignments = await db
    .schema("core")
    .from("role_assignments")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("role_id", roleId);
  if (delAssignments.error) {
    throw delAssignments.error;
  }
}
