/**
 * Shared tenant/scope filtering helpers.
 * Ensures multi-tenant safety by standardizing filter application.
 *
 * @see docs/dev/backend-abstraction.md
 */
export interface TenantScopeContext {
  scopeId: string;
  tenantId: string;
}

/**
 * Returns a filter object for tenant_id and scope_id to apply to queries.
 */
export function tenantScopeFilters(ctx: TenantScopeContext): {
  tenant_id: string;
  scope_id: string;
} {
  return {
    tenant_id: ctx.tenantId,
    scope_id: ctx.scopeId,
  };
}

/**
 * Asserts that the given tenantId matches the context (for cross-tenant leakage prevention).
 */
export function assertTenantMatch(
  ctx: TenantScopeContext,
  resourceTenantId: string
): void {
  if (resourceTenantId !== ctx.tenantId) {
    throw new Error(
      `Tenant mismatch: resource tenant ${resourceTenantId} does not match context tenant ${ctx.tenantId}`
    );
  }
}
