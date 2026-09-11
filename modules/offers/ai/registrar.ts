// Offers AI surface — declared via defineModuleAi (Phase 5).
// agents/offers.manager/agent.json + AGENTS.md, skills/*/SKILL.md.
import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";

const moduleAi = defineModuleAi({
  dir: import.meta.url,
  moduleId: "offers",
});

export function offersDynamicAiCapability(): DynamicAiModuleCapability {
  return moduleAi.dynamicCapability();
}

export function offersAiRegistration(): AiRegistration {
  return moduleAi.aiRegistration();
}
