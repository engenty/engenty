import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The tenant a user who has none of their own joins: the oldest tenant on this
 * installation, or a newly created one when there is not a single tenant yet.
 *
 * It used to upsert on `slug = "default"` and read that slug back, which made
 * the slug load-bearing. The initial-setup wizard renames the first tenant,
 * slug included — and the next sign-up would then have found no `default` row
 * and created a SECOND "Default Tenant" beside the one everybody is in.
 */
export async function ensureDefaultTenant(
  client: SupabaseClient
): Promise<string> {
  const existingId = await oldestTenantId(client);
  if (existingId) {
    return existingId;
  }

  const created = await client
    .schema("core")
    .from("tenants")
    .insert({ slug: "default", name: "Default Tenant" })
    .select("id")
    .single();
  if (!created.error && created.data) {
    return created.data.id as string;
  }
  // Two first sign-ups at once: one insert wins, the other trips the unique
  // slug. Read what the winner wrote rather than failing the loser's request.
  const raced = await oldestTenantId(client);
  if (raced) {
    return raced;
  }
  throw created.error ?? new Error("Failed to create the first tenant.");
}

async function oldestTenantId(client: SupabaseClient): Promise<string | null> {
  const rows = await client
    .schema("core")
    .from("tenants")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  if (rows.error) {
    throw rows.error;
  }
  const first = rows.data?.[0] as { id?: string } | undefined;
  return first?.id ?? null;
}
