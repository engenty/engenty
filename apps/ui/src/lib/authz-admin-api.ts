// Admin client for the roles & permissions console (/setup/roles).
// Talks to the core authz APIs (Phase 1/6/7): the in-code role registry, the
// capability catalog, DB role assignments, effective-grants resolution, and
// tenant-defined custom roles. requestApiJson attaches the caller's token and
// unwraps the { ok, data } envelope.

import { requestApiJson } from "@engenty/api-client";

// Tiny subpath — same matcher the server enforces (not the barrel, which would
// pull the whole plugin-sdk bundle into the UI).
export { capabilityCovers } from "@engenty/plugin-sdk/capability-match";

export interface AuthzRole {
  capabilities: string[];
  description: string | null;
  id: string;
  source: string;
  system: boolean;
  title: string;
}

export interface CapabilityOperation {
  moduleId: string;
  operationId: string;
  requiresApproval: boolean;
  riskLevel: string;
}

export interface CapabilityCatalogEntry {
  capability: string;
  operations: CapabilityOperation[];
}

export interface RoleAssignment {
  agent_id: string | null;
  created_at: string;
  created_by: string | null;
  id: string;
  role_id: string;
  tenant_id: string;
  user_id: string | null;
}

export interface EffectiveGrants {
  capabilities: string[];
  roleProfiles: string[];
}

export interface TenantRole {
  capabilities: string[];
  created_at: string;
  description: string | null;
  id: string;
  role_id: string;
  tenant_id: string;
  title: string;
  updated_at: string;
}

export type SubjectKind = "user" | "agent";

export interface TenantUser {
  display_name: string | null;
  email: string;
  id: string;
  role: string;
}

/** Tenant users (admin-scoped GET /api/users) for the assignment picker. */
export function listTenantUsers() {
  return requestApiJson<TenantUser[]>("/api/users");
}

export function listRoles() {
  return requestApiJson<{ roles: AuthzRole[] }>("/api/authz/roles").then(
    (r) => r.roles
  );
}

export function listCapabilities() {
  return requestApiJson<{ capabilities: CapabilityCatalogEntry[] }>(
    "/api/authz/capabilities"
  ).then((r) => r.capabilities);
}

export function listAssignments(tenantId: string) {
  return requestApiJson<{ assignments: RoleAssignment[] }>(
    `/api/tenants/${tenantId}/role-assignments`
  ).then((r) => r.assignments);
}

export function assignRole(
  tenantId: string,
  input: { roleId: string; subjectKind: SubjectKind; subjectId: string }
) {
  return requestApiJson<{ assignment: RoleAssignment }>(
    `/api/tenants/${tenantId}/role-assignments`,
    { method: "POST", body: input }
  ).then((r) => r.assignment);
}

export function unassignRole(
  tenantId: string,
  input: { roleId: string; subjectKind: SubjectKind; subjectId: string }
) {
  return requestApiJson<{ ok: boolean }>(
    `/api/tenants/${tenantId}/role-assignments`,
    { method: "DELETE", body: input }
  );
}

export function getEffectiveGrants(
  tenantId: string,
  subjectKind: SubjectKind,
  subjectId: string
) {
  return requestApiJson<EffectiveGrants>(
    `/api/tenants/${tenantId}/effective-grants/${subjectKind}/${subjectId}`
  );
}

export function listTenantRoles(tenantId: string) {
  return requestApiJson<{ roles: TenantRole[] }>(
    `/api/tenants/${tenantId}/roles`
  ).then((r) => r.roles);
}

export function createTenantRole(
  tenantId: string,
  input: {
    roleId: string;
    title: string;
    description?: string | null;
    capabilities: string[];
  }
) {
  return requestApiJson<{ role: TenantRole }>(
    `/api/tenants/${tenantId}/roles`,
    { method: "POST", body: input }
  ).then((r) => r.role);
}

export function updateTenantRole(
  tenantId: string,
  roleId: string,
  input: {
    title?: string;
    description?: string | null;
    capabilities?: string[];
  }
) {
  return requestApiJson<{ role: TenantRole }>(
    `/api/tenants/${tenantId}/roles/${encodeURIComponent(roleId)}`,
    { method: "PATCH", body: input }
  ).then((r) => r.role);
}

export function deleteTenantRole(tenantId: string, roleId: string) {
  return requestApiJson<{ ok: boolean }>(
    `/api/tenants/${tenantId}/roles/${encodeURIComponent(roleId)}`,
    { method: "DELETE" }
  );
}
