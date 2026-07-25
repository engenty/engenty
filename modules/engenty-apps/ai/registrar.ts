// engenty Apps AI surface — declared via defineModuleAi.
// agents/engenty.coder/{agent.json,AGENTS.md}, skills/*/SKILL.md.

import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";

const moduleAi = defineModuleAi({
  dir: import.meta.url,
  moduleId: "engenty-apps",
});

export function appsDynamicAiCapability(): DynamicAiModuleCapability {
  return moduleAi.dynamicCapability();
}

export function appsAiRegistration(): AiRegistration {
  return moduleAi.aiRegistration();
}
