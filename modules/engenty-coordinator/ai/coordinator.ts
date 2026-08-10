// engenty.coordinator — goal-driven orchestrator agent.
// Mirrors the Paperclip "CEO" pattern: plans, delegates, monitors.
// Does not execute module operations directly — assigns tasks to specialists.

import type { AgentConfig } from "@engenty/ai-core";
import {
  loadAgentManifest,
  readAgentTextAsset,
  resolveChatModelId,
} from "@engenty/ai-core";

export const ENGENTY_COORDINATOR_AGENT_ID = "engenty.coordinator";

export const COORDINATOR_SKILL_IDS = ["coordinator-workflow"];

// Tools: catalog search/execute for gateway ops + registry lookup so the
// coordinator never relies on hardcoded agent id tables.
export const COORDINATOR_TOOL_IDS = [
  "engenty_tools_search",
  "engenty_tools_discover",
  "engenty_tool_execute",
  "registry_agents_list",
];

const coordinatorAssets = {
  agentId: ENGENTY_COORDINATOR_AGENT_ID,
  importMetaUrl: import.meta.url,
} as const;

export function readCoordinatorAgentsMarkdown(): string {
  return readAgentTextAsset(coordinatorAssets, "AGENTS.md");
}

export function readCoordinatorSoulMarkdown(): string {
  return readAgentTextAsset(coordinatorAssets, "SOUL.md");
}

export function readCoordinatorHeartbeatMarkdown(): string {
  return readAgentTextAsset(coordinatorAssets, "HEARTBEAT.md");
}

export function getCoordinatorManifest() {
  return loadAgentManifest(coordinatorAssets);
}

function buildCoordinatorSystemPrompt(): string {
  return [
    readCoordinatorAgentsMarkdown(),
    readCoordinatorSoulMarkdown(),
    readCoordinatorHeartbeatMarkdown(),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}

// Routing model: Conductor does high-level planning and tool orchestration —
// same model tier as engenty.copilot supervisor.
export const coordinatorAgentConfig: AgentConfig = {
  description:
    "Goal-driven orchestrator. Reviews active goals, decomposes them into tasks, assigns tasks to specialist agents, and monitors progress.",
  id: ENGENTY_COORDINATOR_AGENT_ID,
  instructions: buildCoordinatorSystemPrompt(),
  model: resolveChatModelId({ purpose: "routing" }),
  name: "Coordinator",
  skillIds: COORDINATOR_SKILL_IDS,
  source: "module",
  toolIds: COORDINATOR_TOOL_IDS,
  // Staff preset: /home (agent-scoped rw), /shared (tenant rw), /skills (ro).
  // No sandbox needed — Conductor only calls gateway operations.
  workspace: { enabled: true, preset: "staff" },
};
