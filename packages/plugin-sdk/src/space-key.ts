/**
 * Resolve a space's URL key (`/s/<key>/…`) from its id.
 *
 * Module handlers know the space they run in only as an id
 * (`PluginAuthContext.spaceId`, a record's `space_id` column), but every link
 * a person or agent follows names the KEY. This is the one place a module
 * reads `core.spaces` for it, beside `resolveDefaultSpaceId`, so the query
 * shape and the caching policy exist once.
 *
 * Process-lifetime cache: a key is the URL segment and is never renamed
 * (`updateSpace` omits it on purpose), so an entry cannot go stale short of
 * deleting the space — and a deleted space has no page to link to either way.
 */

interface SpaceKeyResult {
  data: { key?: unknown } | null;
  error: { message?: string } | null;
}

interface SpaceKeyFilter {
  eq(column: string, value: string): SpaceKeyFilter;
  maybeSingle(): PromiseLike<SpaceKeyResult>;
}

/** Structural client slice — plugin-sdk keeps no runtime dep on supabase-js. */
export interface SpaceKeyClient {
  schema(name: string): {
    from(table: string): {
      select(columns: string): SpaceKeyFilter;
    };
  };
}

const cache = new Map<string, string>();

/** Test seam: drop memoized keys so a fixture can change what the client returns. */
export function clearSpaceKeyCache(): void {
  cache.clear();
}

/**
 * The key of `spaceId` in `tenantId`, or null when no such space exists.
 *
 * Null rather than a throw: a missing space is an ordinary answer here (the
 * caller falls back to a `/mdl/…` link that the shell redirects), not a broken
 * install the way a missing default space is.
 */
export async function resolveSpaceKey(
  client: SpaceKeyClient,
  input: { spaceId: string; tenantId: string }
): Promise<string | null> {
  const tenantId = input.tenantId?.trim() ?? "";
  const spaceId = input.spaceId?.trim() ?? "";
  if (!(tenantId && spaceId)) {
    return null;
  }
  const cacheKey = `${tenantId}:${spaceId}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const result = await client
    .schema("core")
    .from("spaces")
    .select("key")
    .eq("tenant_id", tenantId)
    .eq("id", spaceId)
    .maybeSingle();
  if (result.error) {
    return null;
  }
  const key =
    typeof result.data?.key === "string" ? result.data.key.trim() : "";
  if (!key) {
    return null;
  }
  cache.set(cacheKey, key);
  return key;
}
