import type { AgentFnDescriptor } from "@engenty/ai-core";
import { builtinFunctionAgents } from "./agents/function-agents.js";
import {
  CompositeAiRegistry,
  createBuiltinProvider,
  DatabaseProvider,
  type DynamicAiDatabaseStore,
  type DynamicAiModuleCapabilityLoader,
  FunctionAgentProvider,
  type FunctionAgentStateChannel,
  ModuleProvider,
} from "./registry/index.js";

export function createDefaultAiRegistry(
  options: {
    databaseStore?: DynamicAiDatabaseStore | null;
    /** Extra function agents merged over the builtin set (tests, spikes). */
    functionAgents?: AgentFnDescriptor[];
    moduleLoader?: DynamicAiModuleCapabilityLoader;
    /** Durable channel for `useThreadState`; absent = bare renders only. */
    stateChannel?: FunctionAgentStateChannel;
    tenantId?: string;
  } = {}
): CompositeAiRegistry {
  const staticAgents = [
    ...builtinFunctionAgents,
    ...(options.functionAgents ?? []),
  ];
  // One capability fetch per registry instance, shared between the module
  // provider (agent.json/tools) and the function provider (agentFns).
  const moduleLoader = options.moduleLoader
    ? memoizeCapabilityLoader(options.moduleLoader)
    : undefined;
  return new CompositeAiRegistry([
    // Precedence: tenant DB rows > function agents > module agent.json >
    // builtins. A function agent replaces a module's data config of the same
    // id (PLAN-agent-hooks D7); a tenant DB row still overrides both.
    new DatabaseProvider(options.databaseStore, { tenantId: options.tenantId }),
    new FunctionAgentProvider(
      moduleLoader
        ? async () => [
            ...staticAgents,
            ...(await moduleLoader.listModuleCapabilities()).flatMap(
              (capability) => capability.agentFns ?? []
            ),
          ]
        : staticAgents,
      options.stateChannel
    ),
    ...(moduleLoader ? [new ModuleProvider(moduleLoader)] : []),
    createBuiltinProvider(),
  ]);
}

function memoizeCapabilityLoader(
  loader: DynamicAiModuleCapabilityLoader
): DynamicAiModuleCapabilityLoader {
  let cached: ReturnType<
    DynamicAiModuleCapabilityLoader["listModuleCapabilities"]
  > | null = null;
  return {
    listModuleCapabilities() {
      cached ??= loader.listModuleCapabilities();
      return cached;
    },
  };
}
