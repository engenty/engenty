/**
 * The capability ids apps/ai enforces on its own admin surfaces (AUTH-06).
 *
 * They live under `core.ai.*` deliberately: `tenant.member` holds `module.*`,
 * which does NOT cover `core.*`, so a member is excluded by construction — and
 * so is a service credential, whose default bundle is module-tier too. A
 * `tenant.admin` passes via its `*`, which is why no role-profile change is
 * needed to introduce them: they are behaviour-preserving on day one and
 * individually grantable from day two.
 *
 * There is no `core.ai.*` id for the superadmin-only routes (gateway models,
 * model bindings, search-index admin). Superadmin cannot be expressed as a
 * capability — `tenant.admin`'s `*` covers `core.superadmin` for the matcher —
 * so those routes gate on `scope.isSuperAdmin` and must keep doing so.
 */
export const AI_CAPABILITIES = {
  /** Read the platform dispatch queue state and kill-switch. */
  dispatch: "core.ai.dispatch",
  /** Mutate the shared agent registry: models, budgets, instructions. */
  registryManage: "core.ai.registry.manage",
  /** Read tenant-wide AI usage and cost aggregates. */
  usageRead: "core.ai.usage.read",
} as const;
