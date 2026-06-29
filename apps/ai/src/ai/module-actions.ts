// Assembles the effective action set for the current request: in-process
// registrations (apps/ai-local) plus module ACTION.md definitions delivered
// over the core module-capability channel. The loader is tenant-scoped — it
// only returns capabilities for plugins enabled for the caller's tenant, the
// same scoping module agents get via ModuleProvider.
import {
  type ActionDefinition,
  type DynamicAiModuleCapabilityLoader,
  listRegisteredActions,
  type ModuleActionCapability,
} from "@engenty/ai-core";
import { z } from "zod";

// Re-materialize the zod input schema from the transported JSON Schema —
// mirrors how the ACTION.md loader builds `input_schema` in ai-core.
export function materializeModuleAction(
  capability: ModuleActionCapability
): ActionDefinition {
  return {
    ...capability,
    input_schema: z.fromJSONSchema(capability.input_schema_json),
  };
}

export async function listAllActions(
  moduleLoader?: DynamicAiModuleCapabilityLoader
): Promise<ActionDefinition[]> {
  const local = listRegisteredActions();
  if (!moduleLoader) {
    return local;
  }
  const localIds = new Set(local.map((action) => action.id));
  const capabilities = await moduleLoader.listModuleCapabilities();
  const moduleActions = capabilities
    .flatMap((capability) => capability.actions ?? [])
    .filter((action) => !localIds.has(action.id))
    .map(materializeModuleAction);
  return [...local, ...moduleActions];
}

export async function resolveActionById(
  actionId: string,
  moduleLoader?: DynamicAiModuleCapabilityLoader
): Promise<ActionDefinition | undefined> {
  const all = await listAllActions(moduleLoader);
  return all.find((action) => action.id === actionId);
}
