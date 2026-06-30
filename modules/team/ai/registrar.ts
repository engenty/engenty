// Team AI surface — declared via defineModuleAi (Phase 5).
// Skill-only module: skills/*/SKILL.md, no agents of its own.
import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";

const moduleAi = defineModuleAi({
  dir: import.meta.url,
  moduleId: "team",
});

export function teamDynamicAiCapability(): DynamicAiModuleCapability {
  return moduleAi.dynamicCapability();
}

export function teamMembersAiRegistration(): AiRegistration {
  return moduleAi.aiRegistration();
}
