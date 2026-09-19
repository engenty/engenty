/**
 * Open Copilot in Work (or stay on Talk), optionally with a composer draft.
 * Space empty-states use this so "Ask AI" never resumes the last chat.
 */
import {
  ENGENTY_COPILOT_HOST_KEY,
  isTalkConversationPathname,
  openCopilotShell,
  setCopilotComposerDraft,
  useCopilotThreadActions,
} from "@engenty/ai-ui";
import { useCopilotShellOrNull } from "@engenty/app-shell";
import { useCallback } from "react";
import { useLocation } from "react-router-dom";

export function useAskCopilotSidebar(): (prompt?: string) => void {
  const shell = useCopilotShellOrNull();
  const location = useLocation();
  const { startNewChat } = useCopilotThreadActions();

  return useCallback(
    (prompt?: string) => {
      startNewChat();
      shell?.setCompanionWho({ kind: "copilot" });
      if (shell) {
        openCopilotShell({
          chromeHidden: shell.chromeHidden,
          isTalkPage: isTalkConversationPathname(location.pathname),
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
    [location.pathname, shell, startNewChat]
  );
}
