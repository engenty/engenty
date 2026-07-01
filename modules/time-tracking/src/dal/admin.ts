import type { SupabaseClient } from "@supabase/supabase-js";

export async function isPrincipalTenantAdmin(
  supabase: SupabaseClient,
  principalId: string,
  tenantId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .schema("core")
    .from("users")
    .select("role, is_super_admin")
    .eq("id", principalId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) {
    return false;
  }
  const row = data as { role?: string; is_super_admin?: boolean };
  return row.role === "admin" || row.is_super_admin === true;
}
