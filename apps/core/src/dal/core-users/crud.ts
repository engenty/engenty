import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentityAdminService } from "../../identity/identity-admin-service.js";
import { coerceIsSuperAdmin, coerceRole } from "./helpers.js";
import { upsertTenantMembership } from "./memberships.js";
import type { CoreUser, InviteUserInput } from "./types.js";

export interface DirectoryUser {
  displayName: string | null;
  email: string;
  id: string;
}

/**
 * Every column a `CoreUser` is allowed to carry — exactly the fields declared in
 * `CoreUserSchema` (the OpenAPI response contract), and nothing else.
 *
 * `core.users` is wider than `CoreUser`: it also holds `private_phone`,
 * `private_email`, `private_address`, `emergency_contact`, `employee_number`,
 * `position`, `location` and `department`. None of those appear in the `CoreUser`
 * type or in the declared response schema, so nothing reads them — but the reads
 * here used to be `select("*")`, which put all of them on the wire anyway. The
 * type system could not see the leak precisely because the extra keys are absent
 * from the interface.
 *
 * The private fields belong to the HR surface, which owns its own
 * `team_hr.employees` rows and never sources them from here.
 *
 * Naming the columns is therefore the access control, the same way
 * {@link listUserDirectory} and the superadmin DAL already do it. Keep this list
 * in sync with `CoreUserSchema`; a column added to `core.users` must be added
 * here deliberately, not inherited by a wildcard.
 */
const CORE_USER_COLUMNS =
  "id, tenant_id, email, display_name, role, phone, initials, is_super_admin, created_at, updated_at";

/**
 * Everyone in the tenant, as a name and an id — nothing else.
 *
 * The narrow projection is the point. `core.users` also carries
 * `private_phone`, `private_email`, `private_address` and `emergency_contact`,
 * and a "who can I add to this space" picker has no business reading any of
 * them. Every member of the tenant may call this, so the SELECT list is the
 * access control.
 *
 * Deliberately separate from {@link listUsers}, which returns the full
 * {@link CORE_USER_COLUMNS} projection (role, phone, initials) and serves the
 * admin console.
 */
export async function listUserDirectory(
  client: SupabaseClient,
  tenantId: string
): Promise<DirectoryUser[]> {
  const rows = await client
    .schema("core")
    .from("users")
    .select("id, display_name, email")
    .eq("tenant_id", tenantId)
    .order("display_name", { ascending: true });
  if (rows.error) {
    throw rows.error;
  }
  return (rows.data ?? []).map((row) => ({
    displayName: (row as { display_name: string | null }).display_name,
    email: String((row as { email: string }).email),
    id: String((row as { id: string }).id),
  }));
}

export async function listUsers(
  client: SupabaseClient,
  tenantId: string
): Promise<CoreUser[]> {
  const rows = await client
    .schema("core")
    .from("users")
    .select(CORE_USER_COLUMNS)
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
    .select(CORE_USER_COLUMNS)
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

/** Batch-load users by auth id (optional tenant filter). First row wins per id. */
export async function getUsersByIds(
  client: SupabaseClient,
  ids: string[],
  options?: { tenantId?: string }
): Promise<Map<string, CoreUser>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const byId = new Map<string, CoreUser>();
  if (unique.length === 0) {
    return byId;
  }
  let query = client
    .schema("core")
    .from("users")
    .select(CORE_USER_COLUMNS)
    .in("id", unique);
  if (options?.tenantId) {
    query = query.eq("tenant_id", options.tenantId);
  }
  const rows = await query;
  if (rows.error) {
    throw rows.error;
  }
  for (const row of rows.data ?? []) {
    const id = String((row as { id: string }).id);
    if (byId.has(id)) {
      continue;
    }
    byId.set(id, {
      ...row,
      role: coerceRole((row as { role: unknown }).role),
      is_super_admin: coerceIsSuperAdmin(
        (row as { is_super_admin: unknown }).is_super_admin
      ),
    } as CoreUser);
  }
  return byId;
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
    .select(CORE_USER_COLUMNS)
    .single();
  if (updated.error) {
    throw updated.error;
  }
  // Keep core.user_tenant_roles (the canonical membership source) in sync when
  // the primary role changes — role_assignments and resolveGrants FK/read
  // against the join row, so a stale row would drift from core.users.role.
  if (patch.role !== undefined) {
    await upsertTenantMembership(client, {
      userId: id,
      tenantId,
      role: coerceRole(patch.role),
    });
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
