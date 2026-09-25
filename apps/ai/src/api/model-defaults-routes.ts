import type { AiUsageStore } from "@engenty/ai-core";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Context, Hono } from "hono";
import { AI_BASE_PATH } from "../config/constants.js";
import { restoreAiUsageModelPricingDefaults } from "../dal/usage/index.js";
import type { AiGatewayModelStore } from "../gateway-models.js";
import {
  exportAvailableModels,
  restoreModelDefaults,
} from "../model-defaults.js";
import { type AiScopeResolver, resolveScope } from "./http.js";

/**
 * Committed model defaults (`apps/ai/config/available-models.json` +
 * `default-models.json`): export the live activation and pricing for
 * committing, and restore both files. Superadmin-only.
 */
export function registerModelDefaultsRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    getGatewayModelStore: () => AiGatewayModelStore | null;
    getUsageStore: () => AiUsageStore | null;
    scopeResolver: AiScopeResolver;
  }
): void {
  const base = `${AI_BASE_PATH}/v1/models/defaults`;

  async function guard(c: Context) {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return { ok: false as const, response: scope.response };
    }
    if (scope.scope.isSuperAdmin !== true) {
      return {
        ok: false as const,
        response: c.json({ error: "modelDefaults.superadminRequired" }, 403),
      };
    }
    const usageStore = opts.getUsageStore();
    const gatewayStore = opts.getGatewayModelStore();
    if (!(usageStore && gatewayStore)) {
      return {
        ok: false as const,
        response: c.json({ error: "modelDefaults.unconfiguredDatabase" }, 503),
      };
    }
    return { ok: true as const, gatewayStore, usageStore };
  }

  app.get(base, async (c) => {
    const ctx = await guard(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    return c.json(
      await exportAvailableModels(ctx.usageStore, ctx.gatewayStore)
    );
  });

  app.post(`${base}/restore`, async (c) => {
    const ctx = await guard(c);
    if (!ctx.ok) {
      return ctx.response;
    }
    const pricing = await restoreAiUsageModelPricingDefaults(ctx.usageStore);
    const restored = await restoreModelDefaults(ctx.gatewayStore);
    return c.json({ pricing, ...restored });
  });
}
