import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantRole } from "./types.js";

export async function upsertTenantMembership(
  client: SupabaseClient,
  input: { userId: string; tenantId: string; role: TenantRole }
): Promise<void> {
  const { error } = await client
    .schema("core")
    .from("user_tenant_roles")
    .upsert(
      {
        user_id: input.userId,
        tenant_id: input.tenantId,
        role: input.role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,tenant_id" }
    );
  if (error) {
    throw error;
  }
}

export async function listTenantsForUser(
  client: SupabaseClient,
  userId: string
): Promise<Array<{ id: string; slug: string; name: string }>> {
  const memberships = await client
    .schema("core")
    .from("user_tenant_roles")
    .select("tenant_id")
    .eq("user_id", userId);
  if (memberships.error) {
    throw memberships.error;
  }
  const tenantIds = Array.from(
    new Set((memberships.data ?? []).map((row) => row.tenant_id as string))
  );
  if (tenantIds.length === 0) {
    return [];
  }
  const tenants = await client
    .schema("core")
    .from("tenants")
    .select("id, slug, name")
    .in("id", tenantIds)
    .order("name", { ascending: true });
  if (tenants.error) {
    throw tenants.error;
  }
  return (tenants.data ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
  }>;
}
