// Contacts AI surface — declared via defineModuleAi (Phase 5).
// agents/contacts.manager/agent.json (+ AGENTS.md/SOUL.md), skills/*/SKILL.md,
// actions/*/ACTION.md. The dynamic AgentConfig keeps the catalog-led tool/skill
// set via an override (the manifest tool list drives the code-level runtime).
import type {
  AiRegistration,
  DynamicAiModuleCapability,
  TriggerDefinition,
} from "@engenty/ai-core";
import {
  defineModuleAi,
  loadActionDefinitionsFromDirectory,
  resolveModuleActionsDir,
} from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import {
  buildContactsManagerDynamicTools,
  buildContactsManagerSystemPrompt,
  CONTACTS_MANAGER_AGENT_ID,
  CONTACTS_MANAGER_DYNAMIC_TOOL_IDS,
  CONTACTS_MANAGER_SKILL_IDS,
  createContactsManagerAgentDefinition,
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
    {
      id: "contacts_saycharlie_trigger",
      moduleId: "contacts",
      routeKey: "saycharlie",
      triggerType: "button",
      feedbackMode: "chat",
    },
  ];
}

function defineContactsAi(options: {
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"];
}) {
  return defineModuleAi({
    agentDefinitions: () => [
      createContactsManagerAgentDefinition({
        actions: loadActionDefinitionsFromDirectory({
          actionsDir: resolveModuleActionsDir(import.meta.url),
          moduleId: "contacts",
        }),
        invokeContactsOperation: options.invokeContactsOperation,
      }),
    ],
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
