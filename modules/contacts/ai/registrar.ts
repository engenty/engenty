// Contacts AI surface — declared via defineModuleAi.
// agents/contacts.manager/agent.json (+ AGENTS.md/SOUL.md), skills/*/SKILL.md,
// workflows/*.workflow.json. The AgentConfig override pins the catalog-led tool/skill
// set and the code-built system prompt.
import type {
  AiRegistration,
  DynamicAiModuleCapability,
  TriggerDefinition,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import {
  buildContactsManagerDynamicTools,
  buildContactsManagerSystemPrompt,
  CONTACTS_MANAGER_AGENT_ID,
  CONTACTS_MANAGER_DYNAMIC_TOOL_IDS,
  CONTACTS_MANAGER_SKILL_IDS,
  createContactsManagerInstructionDocuments,
} from "./contacts-manager.js";

function createContactsTriggers(): TriggerDefinition[] {
  return [
    {
      id: "contacts_enhance_trigger",
      moduleId: "contacts",
      routeKey: "enhance",
      triggerType: "button",
      feedbackMode: "chat",
    },
    {
      id: "contacts_research_trigger",
      moduleId: "contacts",
      routeKey: "research",
      triggerType: "button",
      feedbackMode: "chat",
    },
  ];
}

function defineContactsAi(_options: {
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"];
}) {
  return defineModuleAi({
    agents: [
      {
        description:
          "Search, inspect, create, research, and enrich tenant contacts with catalog-backed operations and human-reviewed suggestions.",
        id: CONTACTS_MANAGER_AGENT_ID,
        instructions: buildContactsManagerSystemPrompt(),
        skillIds: CONTACTS_MANAGER_SKILL_IDS,
        toolIds: CONTACTS_MANAGER_DYNAMIC_TOOL_IDS,
      },
    ],
    dir: import.meta.url,
    instructionDocuments: [...createContactsManagerInstructionDocuments()],
    moduleId: "contacts",
    tools: buildContactsManagerDynamicTools(),
    triggers: createContactsTriggers(),
  });
}

export function contactsAiRegistration(options: {
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"];
}): AiRegistration {
  return defineContactsAi(options).aiRegistration();
}

export function contactsDynamicAiCapability(options: {
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"];
}): DynamicAiModuleCapability {
  return defineContactsAi(options).dynamicCapability();
}
