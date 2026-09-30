import {
  type AiEffort,
  type AiUsageStore,
  clampEffort,
  formatModelRef,
  graded,
  isEffortAllowed,
  isModelAllowed,
  isUnrestricted,
  type ModelAllowList,
  parseModelRef,
  supportsReasoningEffort,
} from "@engenty/ai-core";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  type AiGatewayModelStore,
  GATEWAY_MODEL_AVAILABILITY_PURPOSES,
  GATEWAY_MODEL_PRICE_TIERS,
  GATEWAY_MODEL_USE_CASES,
  type GatewayModelAvailabilityFlags,
  type GatewayModelOption,
  syncGatewayModels,
} from "../gateway-models.js";
import { type AiScopeResolver, resolveScope } from "./http.js";

const listQuerySchema = z.object({
  availability_purpose: z.enum(GATEWAY_MODEL_AVAILABILITY_PURPOSES).optional(),
  gateway: z.string().trim().min(1).optional(),
  max_output_per_mtok_micros: z.coerce.number().int().nonnegative().optional(),
  max_price_tier: z.enum(GATEWAY_MODEL_PRICE_TIERS).optional(),
  price_tier: z.enum(GATEWAY_MODEL_PRICE_TIERS).optional(),
  provider: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  use_case: z.enum(GATEWAY_MODEL_USE_CASES).optional(),
  web_search: z
    .string()
    .optional()
    .transform((value) => (value == null ? null : value === "true")),
});

const modelOptionsQuerySchema = z.object({
  availability_purpose: z.enum(GATEWAY_MODEL_AVAILABILITY_PURPOSES).optional(),
  gateway: z.string().trim().min(1).optional(),
  max_price_tier: z.enum(GATEWAY_MODEL_PRICE_TIERS).optional(),
  search: z.string().trim().min(1).optional(),
  use_case: z.enum(GATEWAY_MODEL_USE_CASES).optional(),
});

const availabilityPatchSchema = z
  .object({
    available_for_agent: z.boolean().optional(),
    available_for_embedding: z.boolean().optional(),
    available_for_image: z.boolean().optional(),
    available_for_rerank: z.boolean().optional(),
    available_for_classification: z.boolean().optional(),
    available_for_realtime: z.boolean().optional(),
    available_for_text: z.boolean().optional(),
    available_for_transcription: z.boolean().optional(),
    available_for_video: z.boolean().optional(),
    // Optional: omitted, the patch applies to the id on every gateway serving
    // it, which is what a client that predates multiple gateways expects.
    gateway: z.string().trim().min(1).optional(),
    model_id: z.string().trim().min(1),
  })
  .refine(
    (value) =>
      value.available_for_agent != null ||
      value.available_for_embedding != null ||
      value.available_for_image != null ||
      value.available_for_rerank != null ||
      value.available_for_classification != null ||
      value.available_for_realtime != null ||
      value.available_for_text != null ||
      value.available_for_transcription != null ||
      value.available_for_video != null,
    { message: "At least one availability flag is required." }
  );

const syncBodySchema = z.object({
  update_pricing: z.boolean().optional().default(false),
});

function requireSuperAdmin(
  c: { json: (object: unknown, status?: number) => Response },
  scope: { isSuperAdmin?: boolean }
): Response | null {
  if (scope.isSuperAdmin === true) {
    return null;
  }
  return c.json({ error: "gatewayModels.superadminRequired" }, 403);
}

function requireGatewayModelStore(
  c: { json: (object: unknown, status?: number) => Response },
  store: AiGatewayModelStore | null
):
  | { ok: true; store: AiGatewayModelStore }
  | { ok: false; response: Response } {
  if (!store) {
    return {
      ok: false,
      response: c.json({ error: "gatewayModels.unconfiguredDatabase" }, 503),
    };
  }
  return { ok: true, store };
}

export function isGatewayModelStore(
  store: unknown
): store is AiGatewayModelStore {
  return (
    typeof store === "object" &&
    store !== null &&
    "listGatewayModels" in store &&
    "upsertGatewayModels" in store &&
    "insertGatewayModelSyncRun" in store
  );
}

function modelOptionFromRecord(
  model: Awaited<ReturnType<AiGatewayModelStore["listGatewayModels"]>>[number]
): GatewayModelOption {
  return {
    available_for_agent: model.available_for_agent,
    available_for_embedding: model.available_for_embedding,
    available_for_image: model.available_for_image,
    available_for_rerank: model.available_for_rerank,
    available_for_classification: model.available_for_classification,
    available_for_realtime: model.available_for_realtime,
    available_for_text: model.available_for_text,
    available_for_transcription: model.available_for_transcription,
    available_for_video: model.available_for_video,
    context_tokens: model.context_tokens,
    display_name: model.display_name,
    gateway: model.gateway,
    id: model.model_id,
    label: model.display_name
      ? `${model.display_name} (${model.model_id})`
      : model.model_id,
    model_id: model.model_id,
    output_per_mtok_micros: model.output_per_mtok_micros,
    input_per_mtok_micros: model.input_per_mtok_micros,
    price_tier: model.price_tier,
    provider: model.provider,
    reasoning: model.tags.includes("reasoning"),
    tool_use: model.tags.includes("tool-use"),
    use_cases: model.use_cases,
    vision: model.tags.includes("vision"),
    web_search:
      model.tags.includes("web-search") ||
      model.web_search_per_query_micros != null,
  };
}

function availabilityPatchFromBody(
  body: z.infer<typeof availabilityPatchSchema>
): Partial<GatewayModelAvailabilityFlags> {
  return {
    ...(body.available_for_agent == null
      ? {}
      : { available_for_agent: body.available_for_agent }),
    ...(body.available_for_embedding == null
      ? {}
      : { available_for_embedding: body.available_for_embedding }),
    ...(body.available_for_image == null
      ? {}
      : { available_for_image: body.available_for_image }),
    ...(body.available_for_rerank == null
      ? {}
      : { available_for_rerank: body.available_for_rerank }),
    ...(body.available_for_classification == null
      ? {}
      : { available_for_classification: body.available_for_classification }),
    ...(body.available_for_realtime == null
      ? {}
      : { available_for_realtime: body.available_for_realtime }),
    ...(body.available_for_text == null
      ? {}
      : { available_for_text: body.available_for_text }),
    ...(body.available_for_transcription == null
      ? {}
      : { available_for_transcription: body.available_for_transcription }),
    ...(body.available_for_video == null
      ? {}
      : { available_for_video: body.available_for_video }),
  };
}

/**
 * Governance allow-list: when the tenant's usage policy is in `enforce` mode
 * with a non-empty allow-list, only legal models are offered in a picker.
 * Observe mode / no list = unrestricted. A policy read failure never narrows
 * the catalog (fail open — the resolver still enforces at runtime).
 */
async function readEnforcedGrants(
  getUsageStore: (() => AiUsageStore | null) | undefined,
  tenantId: string | null | undefined
): Promise<ModelAllowList | null> {
  if (!tenantId) {
    return null;
  }
  try {
    const policy = await getUsageStore?.()?.getTenantPolicy(tenantId);
    return policy?.enforcement_mode === "enforce" && !isUnrestricted(policy)
      ? policy
      : null;
  } catch {
    return null;
  }
}

async function readAllowedEfforts(
  getUsageStore: (() => AiUsageStore | null) | undefined,
  tenantId: string | null | undefined
): Promise<readonly AiEffort[] | null> {
  if (!tenantId) {
    return null;
  }
  try {
    const policy = await getUsageStore?.()?.getTenantPolicy(tenantId);
    return (policy?.allowed_efforts ?? null) as readonly AiEffort[] | null;
  } catch {
    return null;
  }
}

export function registerGatewayModelRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    getGatewayModelStore: () => AiGatewayModelStore | null;
    /**
     * Usage store for the governance allow-list. When a tenant's usage policy
     * is in `enforce` mode with a non-empty `allowed_models`, the model-options
     * picker is filtered to that list so tenants can only choose legal models.
     */
    getUsageStore?: () => AiUsageStore | null;
    scopeResolver: AiScopeResolver;
  }
): void {
  const base = `${AI_BASE_PATH}/v1/gateway/models`;

  app.get(`${AI_BASE_PATH}/v1/gateway/model-options`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const store = requireGatewayModelStore(c, opts.getGatewayModelStore());
    if (!store.ok) {
      return store.response;
    }
    const parsed = modelOptionsQuerySchema.safeParse({
      availability_purpose: c.req.query("availability_purpose"),
      gateway: c.req.query("gateway"),
      max_price_tier: c.req.query("max_price_tier"),
      search: c.req.query("search"),
      use_case: c.req.query("use_case"),
    });
    if (!parsed.success) {
      return c.json(
        {
          error: "gatewayModels.invalidModelOptionsQuery",
          issues: parsed.error.issues,
        },
        400
      );
    }
    const items = await store.store.listGatewayModels(parsed.data);
    const grants = await readEnforcedGrants(
      opts.getUsageStore,
      scope.scope.tenantId
    );
    // `item.provider` is the catalog's own column, which beats deriving the
    // vendor from the id — that is what makes a provider grant exact.
    const filtered = grants
      ? items.filter((item) =>
          isModelAllowed(item.model_id, grants, item.provider)
        )
      : items;
    return c.json({
      items: filtered.map(modelOptionFromRecord),
    });
  });

  // The composer's menu: the model behind Normal and Extra, and the
  // platform's Custom list (in the admin's order, with what the flyout needs
  // per model) when it is switched on. Member-readable — everyone who can chat picks from it. A listed
  // model the catalog no longer has, or the plan no longer grants, is left
  // out: offering it would only fail at send.
  app.get(`${AI_BASE_PATH}/v1/gateway/composer-options`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const store = requireGatewayModelStore(c, opts.getGatewayModelStore());
    if (!store.ok) {
      return store.response;
    }
    const tenantId = scope.scope.tenantId;
    const [customConfig, rows, bindings, grants, allowedEfforts] =
      await Promise.all([
        store.store.getCustomModelsConfig(),
        store.store.listGatewayModels(),
        store.store.listModelBindings(),
        readEnforcedGrants(opts.getUsageStore, tenantId),
        readAllowedEfforts(opts.getUsageStore, tenantId),
      ]);
    const rowFor = (gateway: string, modelId: string) =>
      rows.find((row) => row.model_id === modelId && row.gateway === gateway);

    const customModels = (
      customConfig.enabled ? customConfig.models : []
    ).flatMap((ref) => {
      const { gateway, modelId } = parseModelRef(ref);
      const row = rowFor(gateway, modelId);
      if (
        !row?.available_for_agent ||
        (grants && !isModelAllowed(modelId, grants, row.provider))
      ) {
        return [];
      }
      return [
        {
          ...modelOptionFromRecord(row),
          reasoning_effort: supportsReasoningEffort(
            ref,
            row.tags.includes("reasoning")
          ),
          ref,
        },
      ];
    });

    // The model behind a mode, after the plan's clamp — the one the run
    // resolves to.
    const modeModel = (effort: AiEffort) => {
      const clamped = clampEffort(effort, { allowed_efforts: allowedEfforts });
      const binding = clamped
        ? bindings.find((b) => b.role === graded(clamped))
        : undefined;
      if (!binding) {
        return null;
      }
      const row = rowFor(binding.gateway, binding.model_id);
      const ref = formatModelRef({
        gateway: binding.gateway,
        modelId: binding.model_id,
      });
      return {
        display_name: row?.display_name ?? null,
        model_id: binding.model_id,
        price_tier: row?.price_tier ?? null,
        provider: row?.provider ?? null,
        reasoning_effort: supportsReasoningEffort(
          ref,
          row?.tags.includes("reasoning") ?? false
        ),
        ref,
      };
    };
    return c.json({
      custom_models: customModels,
      modes: {
        normal: { model: modeModel("normal") },
        extra: {
          allowed: isEffortAllowed("high", { allowed_efforts: allowedEfforts }),
          model: modeModel("high"),
        },
      },
    });
  });

  app.get(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireGatewayModelStore(c, opts.getGatewayModelStore());
    if (!store.ok) {
      return store.response;
    }
    const parsed = listQuerySchema.safeParse({
      availability_purpose: c.req.query("availability_purpose"),
      gateway: c.req.query("gateway"),
      max_output_per_mtok_micros: c.req.query("max_output_per_mtok_micros"),
      max_price_tier: c.req.query("max_price_tier"),
      price_tier: c.req.query("price_tier"),
      provider: c.req.query("provider"),
      search: c.req.query("search"),
      use_case: c.req.query("use_case"),
      web_search: c.req.query("web_search"),
    });
    if (!parsed.success) {
      return c.json(
        { error: "gatewayModels.invalidQuery", issues: parsed.error.issues },
        400
      );
    }
    return c.json({
      items: await store.store.listGatewayModels(parsed.data),
    });
  });

  app.patch(`${base}/availability`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireGatewayModelStore(c, opts.getGatewayModelStore());
    if (!store.ok) {
      return store.response;
    }
    const parsed = availabilityPatchSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return c.json(
        {
          error: "gatewayModels.invalidAvailabilityPatch",
          issues: parsed.error.issues,
        },
        400
      );
    }
    const model = await store.store.updateGatewayModelAvailability(
      parsed.data.model_id,
      availabilityPatchFromBody(parsed.data),
      parsed.data.gateway
    );
    return c.json(model);
  });

  app.post(`${base}/sync`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireGatewayModelStore(c, opts.getGatewayModelStore());
    if (!store.ok) {
      return store.response;
    }
    const parsed = syncBodySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return c.json(
        { error: "gatewayModels.invalidSync", issues: parsed.error.issues },
        400
      );
    }
    const result = await syncGatewayModels(store.store, {
      trigger: "manual",
      updatePricing: parsed.data.update_pricing,
    });
    return c.json(result);
  });

  app.get(`${base}/sync-runs`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const store = requireGatewayModelStore(c, opts.getGatewayModelStore());
    if (!store.ok) {
      return store.response;
    }
    const limit = Math.min(
      Math.max(Number.parseInt(c.req.query("limit") ?? "20", 10), 1),
      100
    );
    return c.json({
      items: await store.store.listGatewayModelSyncRuns(limit),
    });
  });
}
