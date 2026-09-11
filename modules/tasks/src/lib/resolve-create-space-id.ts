/**
 * Which space a newly created work container belongs to (PLAN-spaces.md).
 *
 * "Every work container except Global belongs to exactly one space." Phase 1 put
 * `space_id` on tasks and taught the resolvers to read it, but nothing
 * WROTE it — so every task created through the API landed space-less, which is
 * the one state the tier is not supposed to have.
 *
 * The order matters and is not arbitrary:
 *  1. an explicit `space_id` wins — the caller knows where the work belongs;
 *  2. otherwise INHERIT from the container it is being created inside. A subtask
 *     is in its parent's space, full stop; resolving the tenant default
 *     instead would silently split a chain across two spaces, which is exactly
 *     the conflict `resolveWorkVisibility` has to log about later;
 *  3. only work with no parent at all falls back to the tenant's default space.
 *
 * Every lookup is tenant-scoped. Inside `module_tasks` that is belt-and-braces
 * on a uuidv7 primary key, but one of the containers is `module_projects`, and
 * module DAL runs on a service-role client where RLS is not there to catch a
 * mis-scoped read — see scripts/check-foreign-schema-scope.mjs for the habit
 * this follows. An unscoped read here would let a guessed id pull another
 * tenant's space id into a new row.
 */

interface SpaceIdLookupResult {
  data: { space_id?: unknown } | null;
  error: { message?: string } | null;
}

interface SpaceIdFilter {
  eq(column: string, value: string): SpaceIdFilter;
  maybeSingle(): PromiseLike<SpaceIdLookupResult>;
}

export interface SpaceIdLookupClient {
  schema(name: string): {
    from(table: string): { select(columns: string): SpaceIdFilter };
  };
}

async function spaceIdOf(
  client: SpaceIdLookupClient,
  schema: string,
  table: string,
  id: string,
  tenantId: string
): Promise<string | null> {
  const result = await client
    .schema(schema)
    .from(table)
    .select("space_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (result.error) {
    // A parent we cannot read is not a reason to fail the create; the fallback
    // below still puts the row in a real space.
    return null;
  }
  const value = result.data?.space_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export interface ResolveCreateSpaceIdInput {
  client: SpaceIdLookupClient;
  /** Explicit choice from the caller — always wins. */
  explicit?: string | null;
  /** Containers to inherit from, in priority order: `[[schema, table, id], …]`. */
  inheritFrom?: [
    schema: string,
    table: string,
    id: string | null | undefined,
  ][];
  /** Last resort, injected so this stays free of a plugin-sdk import cycle. */
  resolveDefault: () => Promise<string>;
  /** Scopes every container lookup; see the tenant note in the file header. */
  tenantId: string;
}

export async function resolveCreateSpaceId(
  input: ResolveCreateSpaceIdInput
): Promise<string> {
  const explicit = input.explicit?.trim();
  if (explicit) {
    return explicit;
  }
  for (const [schema, table, id] of input.inheritFrom ?? []) {
    if (!id) {
      continue;
    }
    const inherited = await spaceIdOf(
      input.client,
      schema,
      table,
      id,
      input.tenantId
    );
    if (inherited) {
      return inherited;
    }
  }
  return await input.resolveDefault();
}
