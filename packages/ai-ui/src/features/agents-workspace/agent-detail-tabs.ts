// Pure tab + affordance logic for the agent detail "personnel file" (ui-6 §3).

import type { AiAgentRole } from "../../lib/admin/ai-runtime-types";
import type { AgentsWorkspaceSection } from "./agent-workspace-url-state-parsers";

export type AgentDetailTab =
  | "overview"
  | "capabilities"
  | "instructions"
  | "workspace"
  | "activity";

export const AGENT_DETAIL_TABS: AgentDetailTab[] = [
  "overview",
  "capabilities",
  "instructions",
  "workspace",
  "activity",
];

/** Map a parsed workspace route section onto the active detail tab. */
export function resolveAgentDetailTab(
  section: AgentsWorkspaceSection
): AgentDetailTab {
  switch (section) {
    case "capabilities":
      return "capabilities";
    case "instructions":
      return "instructions";
    case "workspace":
      return "workspace";
    // /sessions stays as an alias of the Activity tab (ui-6 batch 3).
    case "activity":
    case "sessions":
      return "activity";
    default:
      return "overview";
  }
}

export interface AgentDetailAffordances {
  /** Custom agents only: link to /agents/:id/edit. */
  canEditAgent: boolean;
  /** Engenty leadership agents stay always-on (toggle shown locked). */
  chatActiveLocked: boolean;
  /** External (chatbot-managed) agents are read-only Overview-only. */
  isExternal: boolean;
  /** Registry Engenty leadership agents show the chat-active control in the header. */
  showChatActiveToggle: boolean;
  /** External agents collapse to Overview only. */
  visibleTabs: AgentDetailTab[];
}

export function getAgentDetailAffordances(
  agent: {
    agent_origin: "custom" | "registry";
    id: string;
    role?: AiAgentRole;
  } | null
): AgentDetailAffordances {
  const isExternal = agent?.role === "external";
  const chatActiveLocked =
    agent?.role === "copilot" || agent?.id === "engenty.copilot";
  return {
    canEditAgent: !isExternal && agent?.agent_origin === "custom",
    chatActiveLocked: Boolean(chatActiveLocked),
    isExternal,
    showChatActiveToggle:
      agent?.agent_origin === "registry" && Boolean(chatActiveLocked),
    visibleTabs: isExternal ? ["overview"] : AGENT_DETAIL_TABS,
  };
}
