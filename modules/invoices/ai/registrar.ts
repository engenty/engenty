// Invoices AI surface — declared via defineModuleAi (plan 008, phase 6).
// agents/invoices.manager/agent.json + AGENTS.md, skills/*/SKILL.md.
import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import { createInvoicesManagerAgentDefinition } from "./invoices-manager.js";

const moduleAi = defineModuleAi({
  agentDefinitions: () => [createInvoicesManagerAgentDefinition()],
  dir: import.meta.url,
  moduleId: "invoices",
});

export function invoicesDynamicAiCapability(): DynamicAiModuleCapability {
  return moduleAi.dynamicCapability();
}

export function invoicesAiRegistration(): AiRegistration {
  return moduleAi.aiRegistration();
}
