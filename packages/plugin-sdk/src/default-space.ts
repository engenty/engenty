/**
 * Resolve a tenant's default (Company) space.
 *
 * Spaces are core infrastructure, not a module — but module DAL code and the AI
 * lane both need a space id to build storage prefixes (`tenants/<t>/spaces/<s>/…`,
 * see `@engenty/file-storage`). This helper is the one place that reads
 * `core.spaces`, so the query shape and the caching policy exist once.
 *
 * Until every work container carries its own `space_id` (PLAN-spaces.md Phase 6),
 * callers that have no space bound to their work resolve the tenant's default
 * space here. Once the columns land, those call sites take the row's space and
 * this becomes the fallback for tenant-level work only.
 *
 * The database guarantees exactly one default per tenant (`spaces_tenant_default_uniq`)
 * and creates it with the tenant (`tenants_ensure_default_space`), so a missing
 * default means a broken install, not a normal state — hence the throw.
 */

interface DefaultSpaceResult {
  data: { id?: unknown } | null;
  error: { message?: string } | null;
}

/**
 * `.eq()` chained twice, ending in a thenable. `PromiseLike`, not `Promise`:
 * PostgREST's builder is a thenable without `catch`/`finally`, so requiring a
 * full Promise here makes every real client fail to structurally match.
 */
interface DefaultSpaceFilter {
  eq(column: string, value: boolean | string): DefaultSpaceFilter;
  maybeSingle(): PromiseLike<DefaultSpaceResult>;
}

/** Structural client slice — plugin-sdk keeps no runtime dep on supabase-js. */
interface DefaultSpaceClient {
  schema(name: string): {
    from(table: string): {
      select(columns: string): DefaultSpaceFilter;
    };
  };
}

/**
 * Process-lifetime cache. A tenant's default space id never changes — the row is
 * created once with the tenant and the unique index forbids a second one — so
 * there is nothing to invalidate short of deleting it out from under a running
 * process, which would be a manual database edit.
 */
const cache = new Map<string, string>();

/** Test seam: drop memoized ids so a fixture can change what the client returns. */
export function clearDefaultSpaceCache(): void {
  cache.clear();
}

export async function resolveDefaultSpaceId(
  client: DefaultSpaceClient,
  tenantId: string
): Promise<string> {
  const trimmed = tenantId?.trim() ?? "";
  if (!trimmed) {
    throw new Error("tenant_id_required");
  }
  const cached = cache.get(trimmed);
  if (cached) {
    return cached;
  }
  const result = await client
    .schema("core")
    .from("spaces")
    .select("id")
    .eq("tenant_id", trimmed)
    .eq("is_default", true)
    .maybeSingle();
  if (result.error) {
    throw new Error(
      `default_space_lookup_failed: ${result.error.message ?? "unknown error"}`
    );
  }
  const id = typeof result.data?.id === "string" ? result.data.id.trim() : "";
  if (!id) {
    throw new Error(`default_space_missing_for_tenant: ${trimmed}`);
  }
  cache.set(trimmed, id);
  return id;
}
