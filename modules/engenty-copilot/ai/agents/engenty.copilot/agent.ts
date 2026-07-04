import type { AgentConfig, MastraToolDefinition } from "@engenty/ai-core";
import { resolveChatModelId } from "@engenty/ai-core";
import { Agent } from "@mastra/core/agent";
import { ENGENTY_INSTRUCTIONS } from "./instructions.js";
import { ENGENTY_COPILOT_TOOL_IDS } from "./tools.js";

export const ENGENTY_COPILOT_AGENT_ID = "engenty.copilot";

// CLI Agent is a builtin defined in apps/ai — reference by ID string only so
// the copilot module has no circular dependency on the apps layer.
export const ENGENTY_CLI_AGENT_ID = "engenty.cli";

const engentyCopilotSupervisorModel = resolveChatModelId({
  purpose: "routing",
});

export const engentyCopilotAgentConfig: AgentConfig = {
  description:
    "Supervisor copilot for Engenty. Uses registered catalog and app UI tools directly; delegates CLI/sandbox work to the engenty.cli sub-agent.",
  id: ENGENTY_COPILOT_AGENT_ID,
  instructions: ENGENTY_INSTRUCTIONS,
  model: engentyCopilotSupervisorModel,
  name: "Engenty Copilot",
  skillIds: [],
  source: "builtin",
  subAgents: [{ alias: "engenty_cli", id: ENGENTY_CLI_AGENT_ID }],
  toolIds: ENGENTY_COPILOT_TOOL_IDS,
  // Personal-assistant desk: per-user `/home` (rw), `/skills` (ro), `/task`
  // when bound, tenant-shared `/shared` (rw). The sandbox powers Code Mode
  // (`execute_typescript` — read-only tool orchestration programs); the
  // container starts lazily on first use, so idle chats pay nothing.
  // EXECUTE_COMMAND keeps its HITL approval gate; free-form CLI/code work
  // stays delegated to the engenty.cli sub-agent (own sandbox + artifacts).
  workspace: {
    enabled: true,
    preset: "assistant",
    sandbox: {
      enabled: true,
      lifecycle: "session",
      mountPath: "/sandbox",
      requireApproval: true,
    },
    search: { bm25: true },
  },
};

export function createEngentyCopilotAgent(input: {
  tools: Record<string, MastraToolDefinition>;
}) {
  return new Agent({
    id: ENGENTY_COPILOT_AGENT_ID,
    instructions: ENGENTY_INSTRUCTIONS,
    model: engentyCopilotSupervisorModel,
    name: "Engenty Copilot",
    tools: input.tools,
  });
}
