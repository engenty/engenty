/**
 * Guarded reads across module schema boundaries.
 *
 * The client handed to a module by `engenty.server.getServiceDb()` is a
 * service-role client, so it bypasses RLS. Every tenant boundary in module DAL
 * code is therefore enforced in application code — by remembering to write
 * `.eq("tenant_id", …).eq("scope_id", …)` on every query.
 *
 * Inside a module's own schema that habit holds, because the surrounding code
 * is full of examples. It breaks at the boundary: a module reading a *foreign*
 * schema (time-tracking resolving project titles out of `module_projects`) is
 * writing a one-off query with no local precedent, and an omitted filter
 * returns every tenant's rows instead of failing.
 *
 * `foreignSelect` removes the option. It takes the tenant scope as a required
 * argument and applies both filters itself, so a cross-schema read cannot be
 * written unscoped without deliberately bypassing this helper.
 *
 * This is a guard rail, not containment: the raw adapter is still reachable and
 * still bypasses RLS. Real containment means not handing modules a service-role
 * client at all — scoped views or a request-scoped role. Until then this helper
 * plus `scripts/check-foreign-schema-scope.mjs` is what stands between a typo
 * and a cross-tenant leak.
 */

/** The tenant boundary a module DAL call is confined to. */
export interface TenantScope {
  readonly scopeId: string;
  readonly tenantId: string;
}

/** A PostgREST filter builder, structurally — chainable `.eq()`. */
interface ScopedFilterBuilder<Self> {
  eq(column: string, value: string): Self;
}

/**
 * The slice of a Supabase client this helper needs. Structural rather than a
 * `SupabaseClient` import so plugin-sdk keeps no runtime dependency on
 * supabase-js (see `scripts/check-supabase-imports.mjs`).
 */
interface ForeignSchemaClient<Builder> {
  schema(name: string): {
    from(table: string): { select(columns: string): Builder };
  };
}

export interface ForeignTableRef {
  /** PostgREST column list, e.g. `"id, title, client_name"`. */
  readonly columns: string;
  /** Owning module's schema, e.g. `"module_projects"`. */
  readonly schema: string;
  readonly table: string;
}

/**
 * Select from a table owned by another module's schema, with `tenant_id` and
 * `scope_id` already applied. Returns the filter builder so callers can chain
 * their own predicates, ordering and limits on top.
 *
 * The target table must carry both columns. Tables that do not are not
 * tenant-scoped data and must not be read across a schema boundary at all.
 */
export function foreignSelect<Builder extends ScopedFilterBuilder<Builder>>(
  client: ForeignSchemaClient<Builder>,
  scope: TenantScope,
  ref: ForeignTableRef
): Builder {
  // An empty tenant/scope would filter on `""` — which PostgREST rejects for a
  // uuid column but silently matches nothing for text. Neither is a leak, but
  // both surface as "no data" far from the real cause, so fail loudly here.
  if (!scope.tenantId) {
    throw new Error(
      `foreignSelect(${ref.schema}.${ref.table}): tenantId is required`
    );
  }
  if (!scope.scopeId) {
    throw new Error(
      `foreignSelect(${ref.schema}.${ref.table}): scopeId is required`
    );
  }

  return client
    .schema(ref.schema)
    .from(ref.table)
    .select(ref.columns)
    .eq("tenant_id", scope.tenantId)
    .eq("scope_id", scope.scopeId);
}
