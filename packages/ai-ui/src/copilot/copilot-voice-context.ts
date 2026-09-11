import type { AgentUiStateSnapshotV1 } from "@engenty/ag-ui-bridge";
import {
  buildAppNavigationPathsPromptSection,
  formatAgentUiStateHarnessInstructions,
} from "@engenty/ai-core/browser";

/**
 * Voice uses the same AG-UI harness + navigation block as text chat.
 * When the host has not published a snapshot yet, still send canonical paths.
 */
export function formatCopilotVoiceUiStateInstructions(
  snapshot: AgentUiStateSnapshotV1 | null | undefined
): string {
  if (!snapshot) {
    return buildAppNavigationPathsPromptSection();
  }
  return formatAgentUiStateHarnessInstructions(snapshot);
}
