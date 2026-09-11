/**
 * Knowledge Base — AI surface, declared via defineModuleAi (Phase 5).
 *
 * agents/<id>/agent.json (+ AGENTS.md), skills/<name>/SKILL.md,
 * workflows/<id>.workflow.json. Dynamic AgentConfigs keep their code-built
 * system prompts via overrides.
 */
import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import {
  createKbAnswersInstructionDocuments,
  kbAnswersAgentConfig,
} from "./kb-answers-agent.js";
import {
  buildKbManagerDynamicTools,
  createKbManagerInstructionDocuments,
  kbManagerAgentConfig,
} from "./kb-manager-agent.js";

const moduleAi = defineModuleAi({
  agents: [
    {
      description: kbManagerAgentConfig.description,
      id: kbManagerAgentConfig.id,
      instructions: kbManagerAgentConfig.instructions,
    },
    {
      description: kbAnswersAgentConfig.description,
      id: kbAnswersAgentConfig.id,
      instructions: kbAnswersAgentConfig.instructions,
    },
  ],
  dir: import.meta.url,
  instructionDocuments: [
    ...createKbManagerInstructionDocuments(),
    ...createKbAnswersInstructionDocuments(),
  ],
  moduleId: "knowledge-base",
  tools: buildKbManagerDynamicTools(),
  triggers: [
    {
      /** Matches KB copilot contexts that set `routeKey: "enhance"` (e.g. ingest assist). */
      feedbackMode: "chat",
      id: "knowledge_base_ingest_trigger",
      moduleId: "knowledge-base",
      routeKey: "enhance",
      triggerType: "button",
    },
  ],
});

export function knowledgeBaseAiRegistration(_options: {
  invokeKbOperation: PluginServerGatewayCaller["invokeOperation"];
}): AiRegistration {
  return moduleAi.aiRegistration();
}

export function knowledgeBaseDynamicAiCapability(_options: {
  invokeKbOperation: PluginServerGatewayCaller["invokeOperation"];
}): DynamicAiModuleCapability {
  return moduleAi.dynamicCapability();
}
