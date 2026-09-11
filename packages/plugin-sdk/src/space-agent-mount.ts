export type SpaceAgentMountResolution =
  | "mounted"
  | "agent_not_mounted"
  | "space_context_unresolved";

interface LookupResult {
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
}

interface LookupFilter {
  eq(column: string, value: string): LookupFilter;
  maybeSingle(): PromiseLike<LookupResult>;
}

/** Structural client slice; plugin-sdk has no Supabase runtime dependency. */
export interface SpaceAgentMountClient {
  schema(name: string): {
    from(table: string): { select(columns: string): LookupFilter };
  };
}

/**
 * Resolve a Space claim separately from its agent mount.
 *
 * A missing/unreadable Space is not equivalent to an empty Space: callers must
 * preserve that distinction so a stale claimed id cannot widen to tenant-global
 * agent availability.
 */
export async function resolveSpaceAgentMount(
  client: SpaceAgentMountClient,
  input: { agentTypeKey: string; spaceId: string; tenantId: string }
): Promise<SpaceAgentMountResolution> {
  const tenantId = input.tenantId.trim();
  const spaceId = input.spaceId.trim();
  const agentTypeKey = input.agentTypeKey.trim();
  if (!(tenantId && spaceId && agentTypeKey)) {
    return "space_context_unresolved";
  }

  const space = await client
    .schema("core")
    .from("spaces")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", spaceId)
    .maybeSingle();
  if (space.error || !space.data) {
    return "space_context_unresolved";
  }

  const mount = await client
    .schema("core")
    .from("space_mount")
    .select("resource_key")
    .eq("tenant_id", tenantId)
    .eq("space_id", spaceId)
    .eq("resource_type", "agent")
    .eq("resource_key", agentTypeKey)
    .maybeSingle();
  if (mount.error) {
    return "space_context_unresolved";
  }
  return mount.data ? "mounted" : "agent_not_mounted";
}
