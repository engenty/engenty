// Outcome bindings on a routine — nested CRUD + the provider catalog.
//
// Parallel to trigger routes: create may seed `outcomes[]`; PATCH of the
// parent replaces the list when `outcomes` is present; add/edit/delete of
// one binding lives here.
import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import type { Hono } from "hono";
import {
  assertOutcomeBinding,
  type OutcomeBody,
  outcomeSchema,
} from "../ai/routines/outcomes/bindings.js";
import {
  listOutcomeProviders,
  presentOutcomeProvider,
} from "../ai/routines/outcomes/catalog.js";
import { RoutineValidationError } from "../ai/routines/routine-validation.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type {
  RoutineOutcomeRow,
  RoutineOutcomeStore,
} from "../dal/routines/routine-outcome-store.js";
import type { RoutineStore } from "../dal/routines/routine-store.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

export interface RegisterRoutineOutcomeRoutesOptions {
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  outcomes: () => RoutineOutcomeStore | null;
  present: (input: {
    outcomes: RoutineOutcomeRow[];
    routineId: string;
    tenantId: string;
  }) => Promise<Record<string, unknown>>;
  routines: () => RoutineStore | null;
  scopeResolver: AiScopeResolver;
}

export function registerRoutineOutcomeRoutes(
  app: Hono<any>,
  options: RegisterRoutineOutcomeRoutesOptions
): void {
  const { moduleLoader, scopeResolver } = options;
  const base = `${AI_BASE_PATH}/v1/routines`;

  app.get(`${AI_BASE_PATH}/v1/outcome-providers`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const providers = await listOutcomeProviders(moduleLoader);
      return c.json({
        providers: providers.map(presentOutcomeProvider),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list outcome providers",
        "routines.internalError",
        err
      );
    }
  });

  app.post(`${base}/:id/outcomes`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const routines = options.routines();
    const outcomes = options.outcomes();
    if (!(routines && outcomes)) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const body = outcomeSchema.parse(await c.req.json());
      await assertOutcomeBinding(body, moduleLoader);
      const routine = await routines.get({
        id: c.req.param("id"),
        tenantId: resolved.scope.tenantId,
      });
      if (!routine) {
        return c.json({ error: "routines.notFound" }, 404);
      }
      await outcomes.create({
        config: body.config ?? {},
        enabled: body.enabled ?? true,
        mode: body.mode,
        providerId: body.provider_id,
        routineId: routine.id,
        tenantId: resolved.scope.tenantId,
      });
      const rows = await outcomes.list({
        routineId: routine.id,
        tenantId: resolved.scope.tenantId,
      });
      return c.json(
        {
          routine: await options.present({
            outcomes: rows,
            routineId: routine.id,
            tenantId: routine.tenant_id,
          }),
        },
        201
      );
    } catch (err) {
      if (err instanceof RoutineValidationError) {
        return c.json(
          { error: err.code, message: err.message },
          err.status as 400
        );
      }
      return handleRouteError(
        c,
        "failed to add outcome",
        "routines.internalError",
        err
      );
    }
  });

  app.patch(`${base}/:id/outcomes/:outcomeId`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const routines = options.routines();
    const outcomes = options.outcomes();
    if (!(routines && outcomes)) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const body = outcomeSchema.partial().parse(await c.req.json());
      const routine = await routines.get({
        id: c.req.param("id"),
        tenantId: resolved.scope.tenantId,
      });
      const existing = await outcomes.get({
        id: c.req.param("outcomeId"),
        tenantId: resolved.scope.tenantId,
      });
      if (!(routine && existing) || existing.routine_id !== routine.id) {
        return c.json({ error: "routines.notFound" }, 404);
      }
      const merged: OutcomeBody = {
        config: body.config ?? existing.config,
        enabled: body.enabled ?? existing.enabled,
        mode: body.mode ?? existing.mode,
        provider_id: body.provider_id ?? existing.provider_id,
      };
      await assertOutcomeBinding(merged, moduleLoader);
      await outcomes.update({
        id: existing.id,
        tenantId: resolved.scope.tenantId,
        config: merged.config ?? {},
        enabled: merged.enabled,
        mode: merged.mode,
        providerId: merged.provider_id,
      });
      const rows = await outcomes.list({
        routineId: routine.id,
        tenantId: resolved.scope.tenantId,
      });
      return c.json({
        routine: await options.present({
          outcomes: rows,
          routineId: routine.id,
          tenantId: routine.tenant_id,
        }),
      });
    } catch (err) {
      if (err instanceof RoutineValidationError) {
        return c.json(
          { error: err.code, message: err.message },
          err.status as 400
        );
      }
      return handleRouteError(
        c,
        "failed to update outcome",
        "routines.internalError",
        err
      );
    }
  });

  app.delete(`${base}/:id/outcomes/:outcomeId`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const routines = options.routines();
    const outcomes = options.outcomes();
    if (!(routines && outcomes)) {
      return c.json({ error: "routines.storeUnavailable" }, 503);
    }
    try {
      const routine = await routines.get({
        id: c.req.param("id"),
        tenantId: resolved.scope.tenantId,
      });
      const existing = await outcomes.get({
        id: c.req.param("outcomeId"),
        tenantId: resolved.scope.tenantId,
      });
      if (!(routine && existing) || existing.routine_id !== routine.id) {
        return c.json({ error: "routines.notFound" }, 404);
      }
      await outcomes.delete({
        id: existing.id,
        tenantId: resolved.scope.tenantId,
      });
      const rows = await outcomes.list({
        routineId: routine.id,
        tenantId: resolved.scope.tenantId,
      });
      return c.json({
        routine: await options.present({
          outcomes: rows,
          routineId: routine.id,
          tenantId: routine.tenant_id,
        }),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to delete outcome",
        "routines.internalError",
        err
      );
    }
  });
}
