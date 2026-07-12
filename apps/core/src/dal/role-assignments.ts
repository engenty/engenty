import type { SupabaseClient } from "@supabase/supabase-js";
import type { GrantSubject } from "../security/resolve-grants.js";

/**
 * DAL for core.role_assignments. Writes are service-role-only per the existing
 * core convention; use a service-role client here.
 */

export interface RoleAssignmentRow {
  agent_id: string | null;
  created_at: string;
  created_by: string | null;
  id: string;
  role_id: string;
  tenant_id: string;
  user_id: string | null;
}

/** Role ids explicitly assigned to a subject in a tenant (deduped). */
export async function listAssignedRoleIds(
  db: SupabaseClient,
  tenantId: string,
  subject: GrantSubject
): Promise<string[]> {
  const column = subject.kind === "user" ? "user_id" : "agent_id";
  const { data, error } = await db
    .schema("core")
    .from("role_assignments")
    .select("role_id")
    .eq("tenant_id", tenantId)
    .eq(column, subject.id);
  if (error) {
    throw error;
  }
  return [...new Set((data ?? []).map((r) => r.role_id as string))];
}

export async function listAssignmentsForTenant(
  db: SupabaseClient,
  tenantId: string
): Promise<RoleAssignmentRow[]> {
  const { data, error } = await db
    .schema("core")
    .from("role_assignments")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as RoleAssignmentRow[];
}

export interface AssignRoleInput {
  createdBy?: string | null;
  roleId: string;
  subject: { kind: "user" | "agent"; id: string };
  tenantId: string;
}

export async function assignRole(
  db: SupabaseClient,
  input: AssignRoleInput
): Promise<RoleAssignmentRow> {
  const row = {
    tenant_id: input.tenantId,
    role_id: input.roleId,
    user_id: input.subject.kind === "user" ? input.subject.id : null,
    agent_id: input.subject.kind === "agent" ? input.subject.id : null,
    created_by: input.createdBy ?? null,
  };
  const { data, error } = await db
    .schema("core")
    .from("role_assignments")
    .upsert(row, {
      onConflict: "tenant_id,role_id,user_id,agent_id",
      ignoreDuplicates: false,
    })
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as RoleAssignmentRow;
}

export async function unassignRole(
  db: SupabaseClient,
  input: AssignRoleInput
): Promise<void> {
  const column = input.subject.kind === "user" ? "user_id" : "agent_id";
  const { error } = await db
    .schema("core")
    .from("role_assignments")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("role_id", input.roleId)
    .eq(column, input.subject.id);
  if (error) {
    throw error;
  }
}
