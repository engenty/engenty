import { request } from "./http";

export type TenantTier = "platform" | "satellite";
export type TenantStatus = "active" | "suspended" | "provisioning" | "archived";
export type TenantRole = "admin" | "member";

export interface ManageTenant {
  created_at: string;
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  tenant_connection_mode: "shared_instance" | "dedicated_instance";
  tier: TenantTier;
  updated_at: string;
}

export interface TenantMember {
  created_at: string;
  display_name: string | null;
  email: string;
  id: string;
  is_super_admin: boolean;
  role: TenantRole;
  tenant_id: string;
  tenant_role: TenantRole;
  updated_at: string;
}

export function listTenants(signal?: AbortSignal) {
  return request<ManageTenant[]>("/api/superadmin/tenants", { signal });
}

export function getTenant(id: string, signal?: AbortSignal) {
  return request<ManageTenant>(
    `/api/superadmin/tenants/${encodeURIComponent(id)}`,
    { signal }
  );
}

export function createTenant(input: {
  slug: string;
  name: string;
  tier?: TenantTier;
}) {
  return request<ManageTenant>("/api/superadmin/tenants", {
    method: "POST",
    body: input,
  });
}

export function updateTenant(
  id: string,
  patch: { slug?: string; name?: string; tier?: TenantTier }
) {
  return request<ManageTenant>(
    `/api/superadmin/tenants/${encodeURIComponent(id)}`,
    { method: "PATCH", body: patch }
  );
}

export function setTenantStatus(id: string, status: TenantStatus) {
  return request<ManageTenant>(
    `/api/superadmin/tenants/${encodeURIComponent(id)}/status`,
    { method: "POST", body: { status } }
  );
}

export function switchToTenant(id: string) {
  return request<{ tenantId: string }>(
    `/api/superadmin/tenants/${encodeURIComponent(id)}/switch`,
    { method: "POST" }
  );
}

export function listTenantMembers(tenantId: string, signal?: AbortSignal) {
  return request<TenantMember[]>(
    `/api/superadmin/users?tenantId=${encodeURIComponent(tenantId)}`,
    { signal }
  );
}

export function assignMember(
  tenantId: string,
  input: { userId: string; role: TenantRole }
) {
  return request<{ assigned: true }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/users`,
    { method: "POST", body: input }
  );
}

export function updateMemberRole(
  tenantId: string,
  userId: string,
  role: TenantRole
) {
  return request<{ updated: true }>(
    `/api/superadmin/tenants/${encodeURIComponent(
      tenantId
    )}/users/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: { role } }
  );
}

export function removeMember(tenantId: string, userId: string) {
  return request<{ removed: true }>(
    `/api/superadmin/tenants/${encodeURIComponent(
      tenantId
    )}/users/${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
}
