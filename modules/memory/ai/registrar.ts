// Memory AI surface — declared via defineModuleAi. No specialist agent and no
// module tools (the memory tools are first-class in apps/ai); this registrar
// exists to declare the weekly consolidation routine
// (ai/routines/consolidate/ROUTINE.md), which the scheduler reconciles into a
// source:"module" trigger + task template on boot.
import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";

function defineMemoryAi() {
  return defineModuleAi({
    agentDefinitions: () => [],
    dir: import.meta.url,
    moduleId: "memory",
  });
}

export function memoryAiRegistration(): AiRegistration {
  return defineMemoryAi().aiRegistration();
}

export function memoryDynamicAiCapability(): DynamicAiModuleCapability {
  return defineMemoryAi().dynamicCapability();
}
