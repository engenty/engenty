// Conductor AI surface — declared via defineModuleAi (Phase 5).
// agents/engenty.coordinator/agent.json (+ AGENTS.md/SOUL.md/HEARTBEAT.md),
// skills/coordinator-workflow/SKILL.md.
// The hourly heartbeat IS a routine — routines/heartbeat/ROUTINE.md, picked up
// by defineModuleAi's routine discovery (routine = schedule → Task). It was
// never a system job; no such job ever existed, so the coordinator simply never
// woke on its own.
import type {
  AiRegistration,
  DynamicAiModuleCapability,
  InstructionDocumentDefinition,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import {
  coordinatorAgentConfig,
  ENGENTY_COORDINATOR_AGENT_ID,
  readCoordinatorAgentsMarkdown,
  readCoordinatorHeartbeatMarkdown,
  readCoordinatorSoulMarkdown,
} from "./coordinator.js";

function createCoordinatorInstructionDocuments(): InstructionDocumentDefinition[] {
  return [
    {
      default_body: readCoordinatorAgentsMarkdown(),
      filename: "AGENTS.md",
      id: "coordinator_agents",
      key: "coordinator.agents",
      layer: "agent",
      module_id: "engenty-coordinator",
      owner_id: ENGENTY_COORDINATOR_AGENT_ID,
      owner_kind: "agent",
      title: "Conductor identity and rules",
    },
    {
      default_body: readCoordinatorSoulMarkdown(),
      filename: "SOUL.md",
      id: "coordinator_soul",
      key: "coordinator.soul",
      layer: "agent",
      module_id: "engenty-coordinator",
      owner_id: ENGENTY_COORDINATOR_AGENT_ID,
      owner_kind: "agent",
      title: "Conductor tone and persona",
    },
    {
      default_body: readCoordinatorHeartbeatMarkdown(),
      filename: "HEARTBEAT.md",
      id: "coordinator_heartbeat",
      key: "coordinator.heartbeat",
      layer: "agent",
      module_id: "engenty-coordinator",
      owner_id: ENGENTY_COORDINATOR_AGENT_ID,
      owner_kind: "agent",
      title: "Conductor heartbeat guidance",
    },
  ];
}

const moduleAi = defineModuleAi({
  agents: [
    {
      description: coordinatorAgentConfig.description,
      id: coordinatorAgentConfig.id,
      instructions: coordinatorAgentConfig.instructions,
      // Routing model: high-level planning and tool orchestration — same
      // tier as the engenty.copilot supervisor.
      model: coordinatorAgentConfig.model,
      workspace: coordinatorAgentConfig.workspace,
    },
  ],
  dir: import.meta.url,
  instructionDocuments: createCoordinatorInstructionDocuments(),
  moduleId: "engenty-coordinator",
});

/** Full AiRegistration — consumed by core's server.registerAiRegistration. */
export function coordinatorAiRegistration(): AiRegistration {
  return moduleAi.aiRegistration();
}

/** Dynamic capability — apps/ai assembles engenty.coordinator sessions from it. */
export function coordinatorDynamicAiCapability(): DynamicAiModuleCapability {
  return moduleAi.dynamicCapability();
}
