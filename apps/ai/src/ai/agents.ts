import {
  type AiRegistry,
  assembleDynamicAgent,
  CompositeAiRegistry,
  createBuiltinProvider,
  DatabaseProvider,
  type DynamicAiDatabaseStore,
  type DynamicAiModuleCapabilityLoader,
  ModuleProvider,
} from "./registry/index.js";

export function createDefaultAiRegistry(
  options: {
    databaseStore?: DynamicAiDatabaseStore | null;
    moduleLoader?: DynamicAiModuleCapabilityLoader;
    tenantId?: string;
  } = {}
): AiRegistry {
  return new CompositeAiRegistry([
    new DatabaseProvider(options.databaseStore, { tenantId: options.tenantId }),
    ...(options.moduleLoader ? [new ModuleProvider(options.moduleLoader)] : []),
    createBuiltinProvider(),
  ]);
}

export async function assembleDynamicHarnessAgent(
  agentId: string,
  registry: AiRegistry = createDefaultAiRegistry()
) {
  return assembleDynamicAgent(registry, agentId);
}
