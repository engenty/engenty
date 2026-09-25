// engenty.cli — sandboxed code executor sub-agent for the Engenty AI system.
//
// Runs on the Space computer of the run it is delegated from (code_execution
// preset), so its installs, CLI logins and files are the Space's and outlive
// the delegation; with no Space resolved it gets a per-run sandbox. The parent
// copilot delegates data-processing and scripting tasks here; CLI Agent
// returns a structured execution report (see execution-report.ts) so the
// copilot can relay the summary and offer file downloads without parsing raw
// output.

import type { AgentConfig } from "@engenty/ai-core";
import { ENGENTY_CLI_INSTRUCTIONS } from "./instructions.js";
import { ENGENTY_CLI_TOOL_IDS } from "./tools.js";

export const ENGENTY_CLI_AGENT_ID = "engenty.cli";

export const engentyCLIAgentConfig: AgentConfig = {
  description:
    "Sandboxed CLI executor. Runs Python, TypeScript, and shell scripts to process data, perform computations, call APIs, and manipulate files. Promotes outputs to shared storage and returns a structured execution report. Use for tasks that require a real execution environment.",
  id: ENGENTY_CLI_AGENT_ID,
  instructions: ENGENTY_CLI_INSTRUCTIONS,
  // A sub-agent that exists to be delegated to; may not own triggers.
  // A CLI agent writes and runs code: every turn is the top tier.
  effort: "high",
  kind: "delegated",
  name: "CLI Agent",
  skillIds: [],
  source: "builtin",
  toolIds: ENGENTY_CLI_TOOL_IDS,
  workspace: {
    enabled: true,
    preset: "code_execution",
    sandbox: {
      // `run` lands on the Space computer when the run has a Space
      // (`resolveRunSandboxLifecycle`).
      enabled: true,
      lifecycle: "run",
      mountPath: "/sandbox",
      // It installs packages and calls third-party APIs, so it needs the wire.
      // Only the per-run fallback reads this: on the Space computer the
      // Space's reach setting applies. Where `egress` reaches is the host's
      // call — it routes through the proxy when one is configured.
      network: "egress",
      // Copilot gates delegation; CLI execute_command must not double-suspend.
      // Keep false until all chat models accept Mastra tool-approval-response
      // messages (minimax currently 400s on that format).
      requireApproval: false,
      runtimes: ["node", "python"],
    },
  },
};
