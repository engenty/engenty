// Tier 1 embed API barrel — EngentyAI, EngentyAgent, hostKey helpers, affinity stable session keys.

export type { EngentyAgentAffinityKeyInput } from "./affinity.js";
export { resolveEngentyAgentAffinityStableSessionKey } from "./affinity.js";
export {
  EngentyAgent,
  useAgentHost,
  useAgentHostConfig,
  useOptionalAgentHost,
} from "./engenty-agent.js";
export { EngentyAI, useEngentyAIContext } from "./engenty-ai-provider.js";
export {
  ACTIVE_COPILOT_AGENT_ID,
  type ActiveCopilotAgentId,
  ENGENTY_COPILOT_HOST_KEY,
  type EngentyCopilotHostKey,
} from "./host-keys.js";
export {
  type ResolveCopilotWorkContextStableSessionKeyInput,
  resolveCopilotWorkContextStableSessionKey,
} from "./resolve-copilot-work-context.js";
export type {
  AgentHost,
  EngentyAgentProps,
  EngentyAgentStatus,
  EngentyAIContextValue,
  EngentyAIProps,
  EngentyInterruptFeedback,
  HostConfig,
  SubmitMessage,
  SubmitMessageOptions,
} from "./types.js";
