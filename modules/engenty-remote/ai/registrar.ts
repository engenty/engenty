// Remote AI surface — declared via defineModuleAi.
// agents/engenty.remote/agent.json (+ AGENTS.md/SOUL.md).
// The channel runtime (Mastra AgentChannels, webhook routes, scope injection)
// is hosted in apps/ai — this registrar only contributes the agent so it
// exists in the dynamic registry (delegation targets, editor, instructions).

import type {
  AiRegistration,
  DynamicAiModuleCapability,
  InstructionDocumentDefinition,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import {
  ENGENTY_REMOTE_AGENT_ID,
  readRemoteAgentsMarkdown,
  readRemoteSoulMarkdown,
  remoteAgentConfig,
} from "./remote.js";

function createRemoteInstructionDocuments(): InstructionDocumentDefinition[] {
  return [
    {
      default_body: readRemoteAgentsMarkdown(),
      filename: "AGENTS.md",
      id: "remote_agents",
      key: "remote.agents",
      layer: "agent",
      module_id: "engenty-remote",
      owner_id: ENGENTY_REMOTE_AGENT_ID,
      owner_kind: "agent",
      title: "Remote identity and rules",
    },
    {
      default_body: readRemoteSoulMarkdown(),
      filename: "SOUL.md",
      id: "remote_soul",
      key: "remote.soul",
      layer: "agent",
      module_id: "engenty-remote",
      owner_id: ENGENTY_REMOTE_AGENT_ID,
      owner_kind: "agent",
      title: "Remote tone and persona",
    },
  ];
}

const moduleAi = defineModuleAi({
  agents: [
    {
      description: remoteAgentConfig.description,
      id: remoteAgentConfig.id,
      instructions: remoteAgentConfig.instructions,
      // Chat model: conversational quality; messenger turns are short.
      model: remoteAgentConfig.model,
      workspace: remoteAgentConfig.workspace,
    },
  ],
  dir: import.meta.url,
  instructionDocuments: createRemoteInstructionDocuments(),
  moduleId: "engenty-remote",
});

/** Full AiRegistration — consumed by core's server.registerAiRegistration. */
export function remoteAiRegistration(): AiRegistration {
  return moduleAi.aiRegistration();
}

/** Dynamic capability — apps/ai assembles engenty.remote sessions from it. */
export function remoteDynamicAiCapability(): DynamicAiModuleCapability {
  return moduleAi.dynamicCapability();
}
