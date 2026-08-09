// PDF Templates AI surface — skills only (skills/*/SKILL.md).
// No module agent: templates are edited through the copilot with the catalog
// operations, and the skills are what tell it how.
import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";

const moduleAi = defineModuleAi({
  dir: import.meta.url,
  moduleId: "pdf-templates",
});

export function pdfTemplatesDynamicAiCapability(): DynamicAiModuleCapability {
  return moduleAi.dynamicCapability();
}

export function pdfTemplatesAiRegistration(): AiRegistration {
  return moduleAi.aiRegistration();
}
