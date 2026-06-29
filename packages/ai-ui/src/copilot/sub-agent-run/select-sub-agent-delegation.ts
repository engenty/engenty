// Read-only selector: finds one sync Mastra sub-agent delegation (`agent-*` tool
// part) from the current copilot transcript by toolCallId. Used by the full-page
// monitor and safe to call from drawer/full-page without extra fetches.

import { resolveAgentDisplayName } from "../../ag-ui/resolve-transcript-tool-display.js";
import {
  getToolName,
  getToolState,
  isSubAgentDelegationTool,
  isToolPart,
  type ToolPartLike,
} from "../../components/copilot/transcript/copilot-message-parts.js";
import type { CopilotPanelContentProps } from "../../components/presentation.js";

export interface SubAgentDelegationDetail {
  agentId: string;
  agentName: string;
  input?: unknown;
  output?: unknown;
  progressLines: string[];
  state: "pending" | "running" | "completed" | "error";
  toolCallId: string;
  toolName: string;
}

type CopilotMessage = CopilotPanelContentProps["messages"][number];

export function selectSubAgentDelegationFromMessages(
  messages: readonly CopilotMessage[],
  toolCallId: string
): SubAgentDelegationDetail | null {
  const targetId = toolCallId.trim();
  if (!targetId) {
    return null;
  }

  // Newest assistant first — subRun query always targets the latest matching delegation.
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const message = messages[messageIndex];
    if (message?.role !== "assistant") {
      continue;
    }
    const parts = message.parts ?? [];
    for (const rawPart of parts) {
      if (!isToolPart(rawPart)) {
        continue;
      }
      const part = rawPart as ToolPartLike;
      if (part.toolCallId !== targetId) {
        continue;
      }
      const toolName = getToolName(part);
      if (!isSubAgentDelegationTool(part, toolName)) {
        return null;
      }
      const resolved = toolName.startsWith("agent-")
        ? toolName
        : (part.resolvedToolName?.trim() ?? toolName);
      const agentId = resolved.startsWith("agent-")
        ? resolved.slice("agent-".length)
        : resolved;
      return {
        agentId,
        agentName: resolveAgentDisplayName(agentId),
        input: part.input,
        output: part.output,
        progressLines: part.progressLines ?? [],
        state: getToolState(part),
        toolCallId: targetId,
        toolName,
      };
    }
  }

  return null;
}
