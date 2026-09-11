import {
  DEFAULT_MODEL_GATEWAY_ID,
  listRegisteredModelRoles,
  mergeDeclaredRoles,
} from "@engenty/ai-core";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AiGatewayModelStore } from "../gateway-models.js";
import { type AiScopeResolver, resolveScope } from "./http.js";

const bindingPatchSchema = z.object({
  gateway: z.string().min(1).optional(),
  model_id: z.string().min(1),
});

/**
 * The binding console's backend: which model does which job.
 *
 * Superadmin-only. Bindings are a platform decision — the tenant-facing surface
 * deliberately exposes effort tiers instead, so a tenant admin never needs an
 * opinion about a model id.
 */
export function registerModelBindingRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    getGatewayModelStore: () => AiGatewayModelStore | null;
    scopeResolver: AiScopeResolver;
  }
): void {
  const base = `${AI_BASE_PATH}/v1/models/bindings`;

  app.get(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const store = opts.getGatewayModelStore();
    if (!store) {
      return c.json({ error: "modelBindings.unconfiguredDatabase" }, 503);
    }
    // A tenant admin cannot change a binding, but hiding it entirely is what
    // made the effort screen unreadable: "medium" means nothing without knowing
    // what medium runs. They get the graded roles read-only; the specialist
    // roles stay superadmin-only because they are platform plumbing.
    const superAdmin = scope.scope.isSuperAdmin === true;
    // Join the known role catalogue with what is actually bound, so a role that
    // has never been bound still appears — with its seed shown as the fallback.
    // Listing only bound rows would hide exactly the roles someone needs to fix.
    const bound = new Map(
      (await store.listModelBindings()).map((row) => [row.role, row])
    );
    const roles = mergeDeclaredRoles(listRegisteredModelRoles()).filter(
      (spec) => superAdmin || spec.surface === "graded"
    );
    return c.json({
      editable: superAdmin,
      items: roles.map((spec) => {
        const binding = bound.get(spec.role);
        return {
          bound: binding != null,
          declared_by: spec.declaredBy,
          default_model_id: spec.defaultModelId,
          gateway: binding?.gateway ?? DEFAULT_MODEL_GATEWAY_ID,
          label: spec.label,
          model_id: binding?.model_id ?? spec.defaultModelId,
          role: spec.role,
          surface: spec.surface,
          updated_at: binding?.updated_at ?? null,
        };
      }),
    });
  });

  app.patch(`${base}/:role`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    if (scope.scope.isSuperAdmin !== true) {
      return c.json({ error: "modelBindings.superadminRequired" }, 403);
    }
    const store = opts.getGatewayModelStore();
    if (!store) {
      return c.json({ error: "modelBindings.unconfiguredDatabase" }, 503);
    }
    const role = c.req.param("role");
    const known = new Set(
      mergeDeclaredRoles(listRegisteredModelRoles()).map((spec) => spec.role)
    );
    // Refuse unknown roles rather than storing them: a typo would otherwise sit
    // in the table looking authoritative while nothing ever reads it.
    if (!known.has(role)) {
      return c.json({ error: "modelBindings.unknownRole", role }, 404);
    }
    const parsed = bindingPatchSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "modelBindings.invalidBody", issues: parsed.error.issues },
        400
      );
    }
    return c.json(
      await store.upsertModelBinding({
        gateway: parsed.data.gateway ?? DEFAULT_MODEL_GATEWAY_ID,
        model_id: parsed.data.model_id,
        role,
        scope: "platform",
      })
    );
  });

  /** The role catalogue alone, for clients that only need the shape. */
  app.get(`${AI_BASE_PATH}/v1/models/roles`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    return c.json({ items: mergeDeclaredRoles(listRegisteredModelRoles()) });
  });
}
