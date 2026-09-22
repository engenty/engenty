import { useMemo } from "react";
import { openObjectPaneTab } from "../../artifacts/artifact-store.js";
import { setCopilotComposerDraft } from "../../copilot/copilot-composer-draft-intent.js";
import type { ObjectDisplayIntent } from "../../objects/object-display-intent.js";

/**
 * What object cards may do on an Engenty's desk or in a room.
 *
 * The desk owns a pane (the same `WorkspaceArtifactPane` the copilot's
 * full-page chat has), so a record an Engenty shows — or a person clicks —
 * opens BESIDE the conversation instead of leaving it. `show_objects` display
 * hints land there too, which is what lets an Engenty put a module item next
 * to the chat while it talks about it. "Ask the agent to…" prefills this
 * desk's composer, not the copilot's.
 *
 * No `navigateFromChat`: a desk is not a dedicated chat route that has to
 * hand itself off to a drawer before the page changes — a link that leaves
 * simply navigates.
 */
export function useDeskObjectDisplayIntent(
  hostKey: string,
  options?: {
    /**
     * The copilot's page only: a link that leaves for a module route opens
     * the companion first, so the same river is still there on the other
     * side. A specialist's desk simply navigates.
     */
    navigateFromChat?: ObjectDisplayIntent["navigateFromChat"];
  }
): ObjectDisplayIntent {
  const navigateFromChat = options?.navigateFromChat;
  return useMemo<ObjectDisplayIntent>(
    () => ({
      ...(navigateFromChat ? { navigateFromChat } : {}),
      applyDisplayHint: (refs, hint, opts) => {
        const first = refs[0];
        if (!first) {
          return;
        }
        openObjectPaneTab(hostKey, first, {
          expanded: hint === "expanded",
          title: opts?.title,
        });
      },
      askAgent: (prompt) => {
        setCopilotComposerDraft(hostKey, prompt);
      },
      openInPanel: (ref, opts) =>
        openObjectPaneTab(hostKey, ref, {
          expanded: opts?.expanded,
          title: opts?.title,
        }),
    }),
    [hostKey, navigateFromChat]
  );
}
