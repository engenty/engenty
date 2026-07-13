import { request } from "./http";
import type { TenantRole } from "./tenants";

export interface ManageUser {
  created_at: string;
  display_name: string | null;
  email: string;
  id: string;
  is_super_admin: boolean;
  role: TenantRole;
  tenant_id: string;
  updated_at: string;
}

export interface UserIdentity {
  identity_data?: Record<string, unknown>;
  provider: string;
}

export interface UserMembership {
  role: TenantRole;
  tenant_id: string;
  tenant_name: string;
}

export interface UserDetail {
  identities: UserIdentity[];
  tenant_memberships: UserMembership[];
  user: ManageUser;
}

export function listUsers(signal?: AbortSignal) {
  return request<ManageUser[]>("/api/superadmin/users", { signal });
}

export function getUser(id: string, signal?: AbortSignal) {
  return request<UserDetail>(
    `/api/superadmin/users/${encodeURIComponent(id)}`,
    { signal }
  );
}

export function createUser(input: {
  email: string;
  tenant_id: string;
  display_name?: string;
  password?: string;
  role?: TenantRole;
  is_super_admin?: boolean;
}) {
  return request<ManageUser>("/api/superadmin/users", {
    method: "POST",
    body: input,
  });
}

export function updateUser(
  id: string,
  patch: {
    email?: string;
    display_name?: string;
    role?: TenantRole;
    is_super_admin?: boolean;
  }
) {
  return request<ManageUser>(
    `/api/superadmin/users/${encodeURIComponent(id)}`,
    { method: "PATCH", body: patch }
  );
}

export function setUserPassword(id: string, newPassword: string) {
  return request<{ updated: true }>(
    `/api/superadmin/users/${encodeURIComponent(id)}/password`,
    { method: "POST", body: { newPassword } }
  );
}
