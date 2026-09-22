/**
 * Open the river beside the page (or focus it on its own page), optionally
 * with a composer draft. Space empty-states use this for "Ask AI".
 */
import {
  ENGENTY_COPILOT_HOST_KEY,
  isCopilotRiverPathname,
  openCopilotShell,
  setCopilotComposerDraft,
} from "@engenty/ai-ui";
import { useCopilotShellOrNull } from "@engenty/app-shell";
import { useCallback } from "react";
import { useLocation } from "react-router-dom";

export function useAskCopilotSidebar(): (prompt?: string) => void {
  const shell = useCopilotShellOrNull();
  const location = useLocation();

  return useCallback(
    (prompt?: string) => {
      shell?.setCompanionWho({ kind: "copilot" });
      if (shell) {
        openCopilotShell({
          chromeHidden: shell.chromeHidden,
          isTalkPage: isCopilotRiverPathname(location.pathname),
          mergeLayout: shell.copilotLayout.mergeLayout,
          preferredDockMode: shell.preferredDockMode,
          setOpen: shell.setOpen,
          setPreferredDockMode: shell.setPreferredDockMode,
        });
      }
      const text = prompt?.trim();
      if (!text) {
        return;
      }
      if (!setCopilotComposerDraft(ENGENTY_COPILOT_HOST_KEY, text)) {
        requestAnimationFrame(() =>
          setCopilotComposerDraft(ENGENTY_COPILOT_HOST_KEY, text)
        );
      }
    },
    [location.pathname, shell]
  );
}
