/** Canonical `engenty.copilot` agent id — safe for Vite client bundles (no `fs`). */
export const GENERAL_CHAT_AGENT_ID = "engenty.copilot";

/**
 * User setting (`/api/user-settings/:name`, string) holding the face each
 * person picked for their copilot — an `AgentEngentyKind`. Written by the
 * tenant setup wizard.
 */
export const COPILOT_LOOK_USER_SETTING_NAME = "copilot.look";
