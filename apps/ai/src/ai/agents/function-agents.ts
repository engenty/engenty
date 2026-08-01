// Builtin function agents (PLAN-agent-hooks D7): agents authored as
// hook-composed functions instead of static AgentConfig objects. Registered
// via the FunctionAgentProvider in createDefaultAiRegistry.
import type { AgentFnDescriptor } from "@engenty/ai-core";
import { engentyFileAnalystAgent } from "../../../ai/agents/engenty.file-analyst/index.js";
import { issueTriageDemoAgent } from "./function-agents/issue-triage-demo.js";

export const builtinFunctionAgents: AgentFnDescriptor[] = [
  engentyFileAnalystAgent,
  // Phase-machine demo, opt-in so it stays out of tenant catalogs.
  ...(process.env.ENGENTY_DEMO_AGENTS === "1" ? [issueTriageDemoAgent] : []),
];
