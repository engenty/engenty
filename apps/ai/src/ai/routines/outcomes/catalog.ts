import {
  type DynamicAiModuleCapabilityLoader,
  listRegisteredOutcomeProviders,
  type OutcomeProviderDefinition,
} from "@engenty/ai-core";
import { BUILTIN_OUTCOME_PROVIDERS } from "./definitions.js";

/**
 * Built-ins win on id collision. Plugin providers arrive via the capability
 * channel (apps/ai does not share memory with core).
 */
export async function listOutcomeProviders(
  moduleLoader?: DynamicAiModuleCapabilityLoader
): Promise<OutcomeProviderDefinition[]> {
  const byId = new Map<string, OutcomeProviderDefinition>();
  for (const provider of listRegisteredOutcomeProviders()) {
    byId.set(provider.id, provider);
  }
  if (moduleLoader) {
    const capabilities = await moduleLoader.listModuleCapabilities();
    for (const capability of capabilities) {
      for (const provider of capability.outcomeProviders ?? []) {
        byId.set(provider.id, provider);
      }
    }
  }
  for (const provider of BUILTIN_OUTCOME_PROVIDERS) {
    byId.set(provider.id, provider);
  }
  return Array.from(byId.values()).toSorted((a, b) => a.id.localeCompare(b.id));
}

export async function resolveOutcomeProvider(
  providerId: string,
  moduleLoader?: DynamicAiModuleCapabilityLoader
): Promise<OutcomeProviderDefinition | undefined> {
  const all = await listOutcomeProviders(moduleLoader);
  return all.find((provider) => provider.id === providerId);
}

export function presentOutcomeProvider(provider: OutcomeProviderDefinition) {
  return {
    config_schema: provider.configSchema,
    description: provider.description,
    id: provider.id,
    label: provider.label,
    module_id: provider.moduleId,
    ...(provider.operationId ? { operation_id: provider.operationId } : {}),
    payload_schema: provider.payloadSchema,
  };
}
