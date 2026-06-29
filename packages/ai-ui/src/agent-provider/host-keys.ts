// Active main copilot host — hostKey shared across drawer, floating, bottom, full-page.
// See modules/engenty-copilot/dev/active-copilot-v1-decision.md.
export const ENGENTY_COPILOT_HOST_KEY = "engenty:copilot" as const;

export type EngentyCopilotHostKey = typeof ENGENTY_COPILOT_HOST_KEY;

/** Registry agent id for the main copilot host (`engenty:copilot`). */
export const ACTIVE_COPILOT_AGENT_ID = "engenty.copilot" as const;

export type ActiveCopilotAgentId = typeof ACTIVE_COPILOT_AGENT_ID;
