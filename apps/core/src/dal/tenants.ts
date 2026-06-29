import type { SupabaseClient } from "@supabase/supabase-js";

/** Ensures default tenant exists and returns its id. */
export async function ensureDefaultTenant(
  client: SupabaseClient
): Promise<string> {
  const upsert = await client
    .schema("core")
    .from("tenants")
    .upsert(
      { slug: "default", name: "Default Tenant" },
      { onConflict: "slug" }
    );
  if (upsert.error) {
    throw upsert.error;
  }

  const tenant = await client
    .schema("core")
    .from("tenants")
    .select("id")
    .eq("slug", "default")
    .single();
  if (tenant.error || !tenant.data) {
    throw tenant.error ?? new Error("Failed to resolve default tenant.");
  }
  return tenant.data.id as string;
}
