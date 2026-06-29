import type { AiRouteContext } from "./contracts.js";

/**
 * How the current in-app copilot UI invoked the legacy chat runtime.
 *
 * This is intentionally narrower than the future inbound router model:
 * - `message_copilot`: conversational input from the in-app copilot UI,
 *   including the normal one-line natural-language composer
 * - `button`: a button-triggered entrypoint
 * - `shortcut`: a shortcut/command entrypoint
 *
 * For general multi-channel ingress, use `ChannelKind` on agent chat metadata.
 */
export type CopilotTriggerType = "message_copilot" | "button" | "shortcut";

/**
 * How a legacy copilot trigger should surface results back into the current UI.
 *
 * - `headless`: no chat surface; background-only work
 * - `inline`: render feedback inline near the triggering UI
 * - `toast`: lightweight notification only
 * - `chat`: open or reuse the copilot chat surface
 */
export type CopilotTriggerFeedbackMode =
  | "headless"
  | "inline"
  | "toast"
  | "chat";

/** Button/shortcut trigger definition. `canRun` can gate by scope. */
export interface TriggerDefinition {
  canRun?: (ctx: AiRouteContext) => boolean;
  feedbackMode?: CopilotTriggerFeedbackMode;
  id: string;
  moduleId: string;
  routeKey: string;
  triggerType: CopilotTriggerType;
}
