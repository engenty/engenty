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
  max_price_tier: z.enum(GATEWAY_MODEL_PRICE_TIERS).optional(),
  search: z.string().trim().min(1).optional(),
  use_case: z.enum(GATEWAY_MODEL_USE_CASES).optional(),
});

const availabilityPatchSchema = z
  .object({
    available_for_chat: z.boolean().optional(),
    available_for_embedding: z.boolean().optional(),
    available_for_image: z.boolean().optional(),
    available_for_rerank: z.boolean().optional(),
    available_for_routing: z.boolean().optional(),
    available_for_video: z.boolean().optional(),
    model_id: z.string().trim().min(1),
  })
  .refine(
    (value) =>
      value.available_for_chat != null ||
      value.available_for_embedding != null ||
      value.available_for_image != null ||
      value.available_for_rerank != null ||
      value.available_for_routing != null ||
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
    available_for_chat: model.available_for_chat,
    available_for_embedding: model.available_for_embedding,
    available_for_image: model.available_for_image,
    available_for_rerank: model.available_for_rerank,
    available_for_routing: model.available_for_routing,
    available_for_video: model.available_for_video,
    display_name: model.display_name,
    id: model.model_id,
    label: model.display_name
      ? `${model.display_name} (${model.model_id})`
      : model.model_id,
    model_id: model.model_id,
    output_per_mtok_micros: model.output_per_mtok_micros,
    input_per_mtok_micros: model.input_per_mtok_micros,
    price_tier: model.price_tier,
    provider: model.provider,
    use_cases: model.use_cases,
  };
}

function availabilityPatchFromBody(
  body: z.infer<typeof availabilityPatchSchema>
): Partial<GatewayModelAvailabilityFlags> {
  return {
    ...(body.available_for_chat == null
      ? {}
      : { available_for_chat: body.available_for_chat }),
    ...(body.available_for_embedding == null
      ? {}
      : { available_for_embedding: body.available_for_embedding }),
    ...(body.available_for_image == null
      ? {}
      : { available_for_image: body.available_for_image }),
    ...(body.available_for_rerank == null
      ? {}
      : { available_for_rerank: body.available_for_rerank }),
    ...(body.available_for_routing == null
      ? {}
      : { available_for_routing: body.available_for_routing }),
    ...(body.available_for_video == null
      ? {}
      : { available_for_video: body.available_for_video }),
  };
}

export function registerGatewayModelRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    getGatewayModelStore: () => AiGatewayModelStore | null;
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
    return c.json({
      items: items.map(modelOptionFromRecord),
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
      availabilityPatchFromBody(parsed.data)
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
