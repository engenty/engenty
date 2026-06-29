import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentityAdminService } from "../../../identity/identity-admin-service.js";
import { coerceIsSuperAdmin, coerceRole } from "./helpers.js";
import { upsertTenantMembership } from "./memberships.js";
import type { CoreUser, InviteUserInput } from "./types.js";

export async function listUsers(
  client: SupabaseClient,
  tenantId: string
): Promise<CoreUser[]> {
  const rows = await client
    .schema("core")
    .from("users")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (rows.error) {
    throw rows.error;
  }
  return (rows.data ?? []).map((row) => ({
    ...row,
    role: coerceRole(row.role),
    is_super_admin: coerceIsSuperAdmin(row.is_super_admin),
  })) as CoreUser[];
}

export async function getUserById(
  client: SupabaseClient,
  id: string,
  tenantId: string
): Promise<CoreUser | null> {
  const row = await client
    .schema("core")
    .from("users")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (row.error) {
    throw row.error;
  }
  if (!row.data) {
    return null;
  }
  return {
    ...row.data,
    role: coerceRole(row.data.role),
    is_super_admin: coerceIsSuperAdmin(row.data.is_super_admin),
  } as CoreUser;
}

export async function getTenantById(
  client: SupabaseClient,
  id: string
): Promise<{ id: string; slug: string; name: string } | null> {
  const row = await client
    .schema("core")
    .from("tenants")
    .select("id, slug, name")
    .eq("id", id)
    .maybeSingle();
  if (row.error || !row.data) {
    return null;
  }
  return row.data as { id: string; slug: string; name: string };
}

export async function updateUser(
  client: SupabaseClient,
  id: string,
  tenantId: string,
  patch: Partial<
    Omit<CoreUser, "id" | "tenant_id" | "created_at" | "updated_at">
  >
): Promise<CoreUser> {
  const updated = await client
    .schema("core")
    .from("users")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
  if (updated.error) {
    throw updated.error;
  }
  return {
    ...updated.data,
    role: coerceRole(updated.data.role),
    is_super_admin: coerceIsSuperAdmin(updated.data.is_super_admin),
  } as CoreUser;
}

export async function deleteUser(
  client: SupabaseClient,
  id: string,
  tenantId: string,
  identityAdmin: IdentityAdminService
): Promise<void> {
  const deletedCore = await client
    .schema("core")
    .from("users")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (deletedCore.error) {
    throw deletedCore.error;
  }
  await identityAdmin.deleteUser(id);
}

export async function createUserInTenant(
  client: SupabaseClient,
  tenantId: string,
  input: InviteUserInput,
  identityAdmin: IdentityAdminService
): Promise<CoreUser> {
  const { id } = await identityAdmin.createUser({
    email: input.email,
    password: input.password,
    display_name: input.display_name,
    user_metadata: { full_name: input.display_name },
  });
  const insert = await client
    .schema("core")
    .from("users")
    .insert({
      id,
      tenant_id: tenantId,
      email: input.email,
      display_name: input.display_name,
      role: input.role,
      phone: input.phone ?? null,
    });
  if (insert.error) {
    throw insert.error;
  }
  await upsertTenantMembership(client, {
    userId: id,
    tenantId,
    role: input.role,
  });
  const user = await getUserById(client, id, tenantId);
  if (!user) {
    throw new Error("Failed to create core user.");
  }
  return user;
}

export async function updateUserPassword(
  client: SupabaseClient,
  id: string,
  tenantId: string,
  newPassword: string,
  identityAdmin: IdentityAdminService
): Promise<void> {
  const user = await getUserById(client, id, tenantId);
  if (!user) {
    throw new Error("User not found");
  }
  await identityAdmin.updateUserPassword(id, newPassword);
}
