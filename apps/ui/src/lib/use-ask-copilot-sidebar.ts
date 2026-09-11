/**
 * Open Copilot in the sidebar on a fresh thread, optionally with a composer
 * draft. Space empty-states use this so "Ask AI" never resumes the last chat.
 */
import {
  ENGENTY_COPILOT_HOST_KEY,
  openCopilotShell,
  setCopilotComposerDraft,
  useCopilotThreadActions,
} from "@engenty/ai-ui";
import { useCopilotShellOrNull } from "@engenty/app-shell";
import { useCallback } from "react";

export function useAskCopilotSidebar(): (prompt?: string) => void {
  const shell = useCopilotShellOrNull();
  const { startNewChat } = useCopilotThreadActions();

  return useCallback(
    (prompt?: string) => {
      // New thread first — startNewChat clears any leftover composer draft.
      startNewChat();
      if (shell) {
        openCopilotShell({
          mergeLayout: shell.copilotLayout.mergeLayout,
          preferredDockMode: "sidebar",
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
    [shell, startNewChat]
  );
}
