// engenty.cli — sandboxed code executor sub-agent for the Engenty AI system.
//
// Owns a dedicated sandbox (code_execution preset) with session lifecycle keyed
// by the parent copilot's thread, so CLI artifacts survive the HITL
// suspend → approve → resume round-trip. The parent copilot delegates
// data-processing and scripting tasks here; CLI Agent returns a structured
// execution report (see execution-report.ts) so the copilot can relay the
// summary and offer file downloads without parsing raw output.

import type { AgentConfig } from "@engenty/ai-core";
import { resolveChatModelId } from "@engenty/ai-core";
import { ENGENTY_CLI_INSTRUCTIONS } from "./instructions.js";
import { ENGENTY_CLI_TOOL_IDS } from "./tools.js";

export const ENGENTY_CLI_AGENT_ID = "engenty.cli";

// Code-execution agents get their own model resolution slot so operators can
// independently configure a faster/cheaper model for scripting tasks without
// affecting the main chat experience.
const cliAgentModel = resolveChatModelId({ purpose: "code_execution" });

export const engentyCLIAgentConfig: AgentConfig = {
  description:
    "Sandboxed CLI executor. Runs Python, TypeScript, and shell scripts to process data, perform computations, call APIs, and manipulate files. Promotes outputs to shared storage and returns a structured execution report. Use for tasks that require a real execution environment.",
  id: ENGENTY_CLI_AGENT_ID,
  instructions: ENGENTY_CLI_INSTRUCTIONS,
  // A sub-agent that exists to be delegated to; may not own triggers.
  // A CLI agent writes and runs code: every turn is the top tier.
  effort: "high",
  kind: "delegated",
  model: cliAgentModel,
  name: "CLI Agent",
  skillIds: [],
  source: "builtin",
  toolIds: ENGENTY_CLI_TOOL_IDS,
  workspace: {
    enabled: true,
    preset: "code_execution",
    sandbox: {
      // Session lifecycle keys the sandbox dir by parent thread so the CLI
      // agent reuses the same container across multiple delegations within one
      // conversation (files persist through HITL approve/resume round-trips).
      enabled: true,
      lifecycle: "session",
      mountPath: "/sandbox",
      // It installs packages and calls third-party APIs, so it needs the wire.
      // Where that reaches is the host's call — `egress` routes through the
      // proxy when one is configured.
      network: "egress",
      // Copilot gates delegation; CLI execute_command must not double-suspend.
      // Keep false until all chat models accept Mastra tool-approval-response
      // messages (minimax currently 400s on that format).
      requireApproval: false,
      runtimes: ["node", "python"],
    },
  },
};
