// Bridges GuideOverlayHost follow-up actions into the active copilot lane.

import { ENGENTY_COPILOT_HOST_KEY, useAgentHost } from "@engenty/ai-ui";
import { GuideOverlayHost } from "@engenty/app-shell";
import { useCallback } from "react";

export function GuideOverlayHostWithBridge() {
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  const onFollowUpMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      host.submitMessage(trimmed);
    },
    [host]
  );

  return <GuideOverlayHost onFollowUpMessage={onFollowUpMessage} />;
}
