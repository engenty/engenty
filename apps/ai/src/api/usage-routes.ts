import {
  type AiUsageStore,
  DEFAULT_TENANT_USAGE_POLICY,
  resolveCurrentPeriod,
  TENANT_AGGREGATE_USER_ID,
  type TenantUsagePolicyRecord,
} from "@engenty/ai-core";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  restoreAiUsageModelPricingDefaults,
  seedAiUsageModelPricing,
} from "../dal/usage/index.js";
import type { AiGatewayModelStore } from "../gateway-models.js";
import { type AiScopeResolver, resolveScope } from "./http.js";

const periodModeSchema = z.enum(["calendar", "rolling"]);
const periodUnitSchema = z.enum(["day", "week", "month"]);

const tenantPolicyPatchSchema = z.object({
  period_anchor: z.string().nullable().optional(),
  period_mode: periodModeSchema.optional(),
  period_unit: periodUnitSchema.optional(),
});

const adminPolicySchema = tenantPolicyPatchSchema.extend({
  tier: z.string().optional(),
  included_input_tokens: z.number().int().nonnegative().nullable().optional(),
  included_output_tokens: z.number().int().nonnegative().nullable().optional(),
  included_cost_micros: z.number().int().nonnegative().nullable().optional(),
  hard_limit_cost_micros: z.number().int().nonnegative().nullable().optional(),
  soft_limit_cost_micros: z.number().int().nonnegative().nullable().optional(),
  allowed_models: z.array(z.string()).nullable().optional(),
  enforcement_mode: z.enum(["observe", "enforce"]).optional(),
  currency: z.string().optional(),
});

const userPolicySchema = z.object({
  user_id: z.string().min(1),
  max_cost_micros: z.number().int().nonnegative().nullable().optional(),
  max_total_tokens: z.number().int().nonnegative().nullable().optional(),
});

const pricingSchema = z.object({
  cached_input_per_mtok_micros: z.number().int().nonnegative().default(0),
  currency: z.string().default("usd"),
  input_per_mtok_micros: z.number().int().nonnegative(),
  model_id: z.string().min(1),
  output_per_mtok_micros: z.number().int().nonnegative(),
  reasoning_per_mtok_micros: z.number().int().nonnegative().default(0),
  valid_from: z.string().optional(),
  valid_to: z.string().nullable().optional(),
});

function buildEffectivePolicy(
  policy: TenantUsagePolicyRecord | null,
  tenantId: string
): TenantUsagePolicyRecord {
  if (policy) {
    return policy;
  }
  const now = new Date().toISOString();
  return {
    tenant_id: tenantId,
    ...DEFAULT_TENANT_USAGE_POLICY,
    created_at: now,
    updated_at: now,
  };
}

function requireUsageStore(
  c: { json: (object: unknown, status?: number) => Response },
  store: AiUsageStore | null
): { ok: true; store: AiUsageStore } | { ok: false; response: Response } {
  if (!store) {
    return {
      ok: false,
      response: c.json({ error: "usage.unconfiguredDatabase" }, 503),
    };
  }
  return { ok: true, store };
}

function requireUsageAdmin(
  c: { json: (object: unknown, status?: number) => Response },
  scope: {
    isSuperAdmin?: boolean;
    isTenantAdmin?: boolean;
    tenantRole?: "admin" | "member" | null;
  }
): Response | null {
  if (
    scope.isSuperAdmin === true ||
    scope.isTenantAdmin === true ||
    scope.tenantRole === "admin"
  ) {
    return null;
  }
  return c.json({ error: "usage.forbidden" }, 403);
}

function requireSuperAdmin(
  c: { json: (object: unknown, status?: number) => Response },
  scope: { isSuperAdmin?: boolean }
): Response | null {
  if (scope.isSuperAdmin === true) {
    return null;
  }
  return c.json({ error: "usage.superadminRequired" }, 403);
}

async function buildTenantUsageSummary(params: {
  store: AiUsageStore;
  tenantId: string;
  userId: string;
}) {
  const policy = buildEffectivePolicy(
    await params.store.getTenantPolicy(params.tenantId),
    params.tenantId
  );
  const period = resolveCurrentPeriod(policy);
  const [tenantTotals, userTotals, byModel] = await Promise.all([
    params.store.getPeriodTotals({
      tenant_id: params.tenantId,
      user_id: TENANT_AGGREGATE_USER_ID,
      period_start: period.period_start,
    }),
    params.store.getPeriodTotals({
      tenant_id: params.tenantId,
      user_id: params.userId,
      period_start: period.period_start,
    }),
    params.store.summarizeUsageByModel({
      tenant_id: params.tenantId,
      period_start: period.period_start,
      period_end: period.period_end,
    }),
  ]);
  const remaining =
    policy.hard_limit_cost_micros == null
      ? null
      : Math.max(
          0,
          policy.hard_limit_cost_micros - (tenantTotals?.cost_micros ?? 0)
        );
  return {
    period_mode: policy.period_mode,
    period_unit: policy.period_unit,
    period_start: period.period_start,
    period_end: period.period_end,
    enforcement_mode: policy.enforcement_mode,
    currency: policy.currency,
    hard_limit_cost_micros: policy.hard_limit_cost_micros,
    soft_limit_cost_micros: policy.soft_limit_cost_micros,
    remaining_cost_micros: remaining,
    tenant_totals: tenantTotals,
    user_totals: userTotals,
    breakdown_by_model: byModel,
  };
}

export function registerUsageRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    getUsageStore: () => AiUsageStore | null;
    /** Optional: when present, restore also applies availability flags from seed data. */
    getGatewayModelStore?: () => AiGatewayModelStore | null;
    scopeResolver: AiScopeResolver;
  }
): void {
  const base = `${AI_BASE_PATH}/v1/usage`;

  app.get(`${base}/me`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireUsageAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    return c.json(
      await buildTenantUsageSummary({
        store: store.store,
        tenantId: scope.scope.tenantId,
        userId: scope.scope.userId,
      })
    );
  });

  app.get(`${base}/tenant`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireUsageAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    const summary = await buildTenantUsageSummary({
      store: store.store,
      tenantId: scope.scope.tenantId,
      userId: scope.scope.userId,
    });
    const byUser = await store.store.summarizeUsageByUser({
      tenant_id: scope.scope.tenantId,
      period_start: summary.period_start,
      period_end: summary.period_end,
    });
    return c.json({
      ...summary,
      tenant_id: scope.scope.tenantId,
      breakdown_by_user: byUser,
    });
  });

  app.get(`${base}/policy`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireUsageAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    return c.json(
      buildEffectivePolicy(
        await store.store.getTenantPolicy(scope.scope.tenantId),
        scope.scope.tenantId
      )
    );
  });

  app.patch(`${base}/policy`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireUsageAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    const parsed = tenantPolicyPatchSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return c.json(
        { error: "usage.invalidPolicy", issues: parsed.error.issues },
        400
      );
    }
    const current = buildEffectivePolicy(
      await store.store.getTenantPolicy(scope.scope.tenantId),
      scope.scope.tenantId
    );
    const policy = await store.store.upsertTenantPolicy({
      ...current,
      tenant_id: scope.scope.tenantId,
      period_mode: parsed.data.period_mode ?? current.period_mode,
      period_unit: parsed.data.period_unit ?? current.period_unit,
      period_anchor:
        parsed.data.period_anchor === undefined
          ? current.period_anchor
          : parsed.data.period_anchor,
      updated_at: new Date().toISOString(),
    });
    return c.json(policy);
  });

  app.get(`${base}/model-pricing`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    const items = await store.store.listModelPricing();
    return c.json({ items });
  });

  app.get(`${base}/model-pricing/history`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    const items = await store.store.listUsedModelPricing();
    return c.json({ items });
  });

  app.post(`${base}/model-pricing`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    const parsed = pricingSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return c.json(
        { error: "usage.invalidPricing", issues: parsed.error.issues },
        400
      );
    }
    const inserted = await store.store.insertModelPricing({
      ...parsed.data,
      valid_from: parsed.data.valid_from ?? new Date().toISOString(),
      valid_to: parsed.data.valid_to ?? null,
    });
    return c.json(inserted, 201);
  });

  app.post(`${base}/model-pricing/sync-defaults`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    return c.json(await seedAiUsageModelPricing(store.store));
  });

  app.post(`${base}/model-pricing/restore-defaults`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    const gatewayStore = opts.getGatewayModelStore?.() ?? null;
    return c.json(
      await restoreAiUsageModelPricingDefaults(store.store, gatewayStore)
    );
  });

  const adminBase = `${base}/admin/tenants`;

  app.get(`${adminBase}/:tenantId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    const tenantId = c.req.param("tenantId");
    const policy = buildEffectivePolicy(
      await store.store.getTenantPolicy(tenantId),
      tenantId
    );
    const period = resolveCurrentPeriod(policy);
    const [tenantTotals, breakdownByModel, breakdownByUser] = await Promise.all(
      [
        store.store.getPeriodTotals({
          tenant_id: tenantId,
          user_id: TENANT_AGGREGATE_USER_ID,
          period_start: period.period_start,
        }),
        store.store.summarizeUsageByModel({
          tenant_id: tenantId,
          period_start: period.period_start,
          period_end: period.period_end,
        }),
        store.store.summarizeUsageByUser({
          tenant_id: tenantId,
          period_start: period.period_start,
          period_end: period.period_end,
        }),
      ]
    );
    return c.json({
      tenant_id: tenantId,
      policy,
      period_start: period.period_start,
      period_end: period.period_end,
      tenant_totals: tenantTotals,
      breakdown_by_model: breakdownByModel,
      breakdown_by_user: breakdownByUser,
    });
  });

  app.get(`${adminBase}/:tenantId/policy`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    const tenantId = c.req.param("tenantId");
    const policy = buildEffectivePolicy(
      await store.store.getTenantPolicy(tenantId),
      tenantId
    );
    const userPolicies = await store.store.listUserPolicies(tenantId);
    return c.json({ policy, user_policies: userPolicies });
  });

  app.patch(`${adminBase}/:tenantId/policy`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    const tenantId = c.req.param("tenantId");
    const parsed = adminPolicySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return c.json(
        { error: "usage.invalidPolicy", issues: parsed.error.issues },
        400
      );
    }
    const current = buildEffectivePolicy(
      await store.store.getTenantPolicy(tenantId),
      tenantId
    );
    const merged = await store.store.upsertTenantPolicy({
      ...current,
      tenant_id: tenantId,
      tier: parsed.data.tier ?? current.tier,
      period_mode: parsed.data.period_mode ?? current.period_mode,
      period_unit: parsed.data.period_unit ?? current.period_unit,
      period_anchor:
        parsed.data.period_anchor === undefined
          ? current.period_anchor
          : parsed.data.period_anchor,
      included_input_tokens:
        parsed.data.included_input_tokens === undefined
          ? current.included_input_tokens
          : parsed.data.included_input_tokens,
      included_output_tokens:
        parsed.data.included_output_tokens === undefined
          ? current.included_output_tokens
          : parsed.data.included_output_tokens,
      included_cost_micros:
        parsed.data.included_cost_micros === undefined
          ? current.included_cost_micros
          : parsed.data.included_cost_micros,
      hard_limit_cost_micros:
        parsed.data.hard_limit_cost_micros === undefined
          ? current.hard_limit_cost_micros
          : parsed.data.hard_limit_cost_micros,
      soft_limit_cost_micros:
        parsed.data.soft_limit_cost_micros === undefined
          ? current.soft_limit_cost_micros
          : parsed.data.soft_limit_cost_micros,
      allowed_models:
        parsed.data.allowed_models === undefined
          ? current.allowed_models
          : parsed.data.allowed_models,
      enforcement_mode:
        parsed.data.enforcement_mode ?? current.enforcement_mode,
      currency: parsed.data.currency ?? current.currency,
      updated_at: new Date().toISOString(),
    });
    return c.json(merged);
  });

  app.put(`${adminBase}/:tenantId/users`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireUsageStore(c, opts.getUsageStore());
    if (!store.ok) {
      return store.response;
    }
    const tenantId = c.req.param("tenantId");
    const parsed = userPolicySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return c.json(
        { error: "usage.invalidUserPolicy", issues: parsed.error.issues },
        400
      );
    }
    const merged = await store.store.upsertUserPolicy({
      tenant_id: tenantId,
      user_id: parsed.data.user_id,
      max_cost_micros: parsed.data.max_cost_micros ?? null,
      max_total_tokens: parsed.data.max_total_tokens ?? null,
    });
    return c.json(merged);
  });
}
