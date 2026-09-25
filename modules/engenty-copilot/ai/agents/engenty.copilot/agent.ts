import type { AgentConfig, MastraToolDefinition } from "@engenty/ai-core";
import { resolveChatModelId } from "@engenty/ai-core";
import { Agent, type ToolsInput } from "@mastra/core/agent";
import { ENGENTY_INSTRUCTIONS } from "./instructions.js";
import {
  ENGENTY_COPILOT_SKILL_TOOL_IDS,
  ENGENTY_COPILOT_TOOL_IDS,
} from "./tools.js";

export const ENGENTY_COPILOT_AGENT_ID = "engenty.copilot";

// Builtin specialists defined in apps/ai — reference by ID string only so
// the copilot module has no circular dependency on the apps layer.
export const ENGENTY_CLI_AGENT_ID = "engenty.cli";
export const ENGENTY_FILE_ANALYST_AGENT_ID = "engenty.file-analyst";
// App-building specialist from the (optional, tenant-scoped) engenty-apps
// module — referenced by ID string only, same reasoning as the two above.
// AGENTS.md already mandates delegating app-build requests here; this alias
// is what makes that delegation possible at all (there was no agent-app_coder
// tool without it, so the copilot fell back to engenty.cli for app requests).
export const ENGENTY_APP_CODER_AGENT_ID = "engenty.app-coder";

export const engentyCopilotAgentConfig: AgentConfig = {
  description:
    "Live front-door copilot for Engenty. Completes bounded work in this chat. Recurring jobs become Routines on an Engenty; owned work is a Task, and an outcome that needs several becomes several linked Tasks.",
  engenty: "round",
  id: ENGENTY_COPILOT_AGENT_ID,
  instructions: ENGENTY_INSTRUCTIONS,
  agentScope: "personal",
  interfaceRole: "live",
  // The space's live mouth/ears — platform-placed, never hired.
  kind: "interface",
  name: "Engenty Copilot",
  skillIds: [
    "work-routing",
    "hire-agent",
    "durable-work",
    "routines",
    "space-data",
    "space-setup",
    "getting-started",
  ],
  source: "builtin",
  subAgents: [
    { alias: "engenty_cli", id: ENGENTY_CLI_AGENT_ID },
    { alias: "file_analyst", id: ENGENTY_FILE_ANALYST_AGENT_ID },
    { alias: "app_coder", id: ENGENTY_APP_CODER_AGENT_ID },
  ],
  toolIds: ENGENTY_COPILOT_TOOL_IDS,
  // Lane tools ride with their lane skill instead of in every call. See
  // ENGENTY_COPILOT_SKILL_TOOL_IDS — a tool listed there is withheld until the
  // skill is activated, which happens mid-turn, and anything unlisted stays on.
  toolGating: { bySkill: ENGENTY_COPILOT_SKILL_TOOL_IDS },
  // Personal-assistant desk: per-user `/home` (rw), `/skills` (ro), `/task`
  // when bound, `/space` (rw) and the read-only `/company`. The sandbox is the computer of
  // the Space the person stands in (`run` + the run's Space, see
  // `resolveRunSandboxLifecycle`), shared with that Space's agents and
  // engenty.cli; `/home` is file tools only there. The sandbox powers Code Mode
  // (`execute_typescript` — tool orchestration programs; reads run freely,
  // gated writes need a grant via engenty_tools_preapprove first); the
  // container starts lazily on first use, so idle chats pay nothing.
  // EXECUTE_COMMAND runs unapproved, like engenty.cli on the same computer —
  // a gate one delegation away from an ungated shell protects nothing.
  // Free-form CLI/code work stays delegated to engenty.cli (own report).
  workspace: {
    enabled: true,
    preset: "assistant",
    sandbox: {
      enabled: true,
      lifecycle: "run",
      mountPath: "/sandbox",
      requireApproval: false,
    },
    search: { bm25: true },
    // Long-running-process control and code intelligence belong to the agents
    // that do free-form code work in their own sandbox. Attached here they were
    // never called and still cost ~8.9 KB of schema on every model call, since
    // Mastra attaches its whole workspace set whenever a workspace exists.
    // EXECUTE_COMMAND stays (gated) — it is the one-shot escape hatch.
    disabledWorkspaceTools: [
      "mastra_workspace_get_process_output",
      "mastra_workspace_kill_process",
      "mastra_workspace_lsp_inspect",
    ],
  },
};

export function createEngentyCopilotAgent(input: {
  tools: Record<string, MastraToolDefinition>;
}) {
  return new Agent({
    id: ENGENTY_COPILOT_AGENT_ID,
    instructions: ENGENTY_INSTRUCTIONS,
    // Resolved per call: the `chat` binding may change after boot.
    model: () => resolveChatModelId({ purpose: "chat" }),
    name: "Engenty Copilot",
    // `MastraToolDefinition` is `object` — ai-core keeps no @mastra/core
    // dependency, so the opaque contract type is widened here, in the one layer
    // that does import Agent. Core 1.61 narrowed `tools` to DynamicArgument<
    // ToolsInput>, which `Record<string, object>` no longer satisfies.
    tools: input.tools as ToolsInput,
  });
}
