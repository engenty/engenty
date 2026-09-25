// Writing a routine's destinations (`ai.routine_outcomes` rows).
//
// One path for every writer: the HTTP routes and the routines_* agent tools
// both validate a binding against the registered provider catalog and replace
// the list through here.
import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { z } from "zod";
import type {
  RoutineOutcomeRow,
  RoutineOutcomeStore,
} from "../../../dal/routines/routine-outcome-store.js";
import { RoutineValidationError } from "../routine-validation.js";
import { listOutcomeProviders } from "./catalog.js";
import { validateAgainstJsonSchema } from "./validate.js";

export const outcomeSchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  mode: z.enum(["always", "agent"]),
  provider_id: z.string().min(1).max(128),
});

export type OutcomeBody = z.infer<typeof outcomeSchema>;

/** Reject a binding whose provider is not registered or whose config does not fit it. */
export async function assertOutcomeBinding(
  body: OutcomeBody,
  moduleLoader?: DynamicAiModuleCapabilityLoader
): Promise<void> {
  const providers = await listOutcomeProviders(moduleLoader);
  const provider = providers.find((entry) => entry.id === body.provider_id);
  if (!provider) {
    throw new RoutineValidationError(
      "routines.outcomeProviderUnknown",
      `unknown outcome provider '${body.provider_id}' — registered: ${providers
        .map((entry) => entry.id)
        .join(", ")}`
    );
  }
  validateAgainstJsonSchema(
    provider.configSchema,
    body.config ?? {},
    `${provider.id} config`
  );
}

/** Validate every binding, then swap the routine's destinations for them. */
export async function replaceRoutineOutcomes(input: {
  bodies: OutcomeBody[];
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  outcomes: RoutineOutcomeStore;
  routineId: string;
  tenantId: string;
}): Promise<RoutineOutcomeRow[]> {
  for (const body of input.bodies) {
    await assertOutcomeBinding(body, input.moduleLoader);
  }
  const existing = await input.outcomes.list({
    routineId: input.routineId,
    tenantId: input.tenantId,
  });
  for (const row of existing) {
    await input.outcomes.delete({ id: row.id, tenantId: input.tenantId });
  }
  const created: RoutineOutcomeRow[] = [];
  for (const body of input.bodies) {
    created.push(
      await input.outcomes.create({
        config: body.config ?? {},
        enabled: body.enabled ?? true,
        mode: body.mode,
        providerId: body.provider_id,
        routineId: input.routineId,
        tenantId: input.tenantId,
      })
    );
  }
  return created;
}

/** A tenant's destinations, grouped by routine id. */
export async function outcomesByRoutine(
  store: RoutineOutcomeStore,
  tenantId: string
): Promise<Map<string, RoutineOutcomeRow[]>> {
  const rows = await store.list({ tenantId });
  const map = new Map<string, RoutineOutcomeRow[]>();
  for (const row of rows) {
    const list = map.get(row.routine_id) ?? [];
    list.push(row);
    map.set(row.routine_id, list);
  }
  return map;
}
