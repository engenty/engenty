import {
  ENGENTY_COPILOT_HOST_KEY,
  isTalkConversationPathname,
  openCopilotShell,
  setCopilotComposerDraft,
} from "@engenty/ai-ui";
import { useCopilotShell } from "@engenty/app-shell";
import { useCallback } from "react";
import { useLocation } from "react-router-dom";

/**
 * Hand a prompt to the global Copilot dock: open the shell and prefill its
 * composer. Inbox AI chips / the conversation footer ask-box use this so there
 * is still one agent chat surface — the thread footer only drafts the prompt.
 *
 * The prompt is a draft, not a send: the reader still sees it before it goes.
 */
export function useAskCopilot(): (prompt: string) => void {
  const {
    chromeHidden,
    copilotLayout,
    preferredDockMode,
    setCompanionWho,
    setOpen,
    setPreferredDockMode,
  } = useCopilotShell();
  const location = useLocation();

  return useCallback(
    (prompt: string) => {
      setCompanionWho({ kind: "copilot" });
      openCopilotShell({
        chromeHidden,
        isTalkPage: isTalkConversationPathname(location.pathname),
        mergeLayout: copilotLayout.mergeLayout,
        preferredDockMode,
        setOpen,
        setPreferredDockMode,
      });
      // The composer may still be mounting when the dock was closed; the
      // bridge reports that, and the next frame has it.
      if (!setCopilotComposerDraft(ENGENTY_COPILOT_HOST_KEY, prompt)) {
        requestAnimationFrame(() =>
          setCopilotComposerDraft(ENGENTY_COPILOT_HOST_KEY, prompt)
        );
      }
    },
    [
      chromeHidden,
      copilotLayout.mergeLayout,
      location.pathname,
      preferredDockMode,
      setCompanionWho,
      setOpen,
      setPreferredDockMode,
    ]
  );
}
