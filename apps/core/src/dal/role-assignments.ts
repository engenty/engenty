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

export interface TenantAgentRow {
  id: string;
  name: string;
  status: string;
}

/**
 * The tenant's agent PRINCIPALS — what a role is actually granted to.
 *
 * `core.agents.name` is the agent_type_key ("contacts.manager"); the id is the
 * uuid the assignment stores. The roles UI used to make a person paste that
 * uuid, which meant looking it up in the database first.
 */
export async function listTenantAgents(
  db: SupabaseClient,
  tenantId: string
): Promise<TenantAgentRow[]> {
  const { data, error } = await db
    .schema("core")
    .from("agents")
    .select("id, name, status")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as TenantAgentRow[];
}

export async function getAgentById(
  db: SupabaseClient,
  tenantId: string,
  agentId: string
): Promise<TenantAgentRow | null> {
  const { data, error } = await db
    .schema("core")
    .from("agents")
    .select("id, name, status")
    .eq("tenant_id", tenantId)
    .eq("id", agentId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data as TenantAgentRow | null) ?? null;
}

/**
 * Find-or-create the agent principal for `(tenant, agent_type_key)`.
 *
 * Reports whether it CREATED the row, because "first time we ever saw this
 * agent" is the only moment a default grant may be attached — re-granting on
 * every call would make revoking a default impossible. Race-safe: the loser of
 * a concurrent insert re-reads and reports `created: false`, so exactly one
 * caller can act on a creation.
 */
export async function ensureAgentPrincipal(
  db: SupabaseClient,
  tenantId: string,
  name: string
): Promise<{ agent: TenantAgentRow; created: boolean }> {
  const agents = () => db.schema("core").from("agents");
  const read = async (): Promise<TenantAgentRow | null> => {
    const { data, error } = await agents()
      .select("id, name, status")
      .eq("tenant_id", tenantId)
      .eq("name", name)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return (data as TenantAgentRow | null) ?? null;
  };

  const existing = await read();
  if (existing) {
    return { agent: existing, created: false };
  }

  const { data, error } = await agents()
    .insert({ name, status: "active", tenant_id: tenantId })
    .select("id, name, status")
    .single();
  if (error) {
    // Lost the race against a concurrent insert — the row exists now.
    const raced = await read();
    if (raced) {
      return { agent: raced, created: false };
    }
    throw error;
  }
  return { agent: data as TenantAgentRow, created: true };
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
