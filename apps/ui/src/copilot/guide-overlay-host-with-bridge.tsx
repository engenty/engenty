// Bridges GuideOverlayHost follow-up actions into the active copilot lane,
// and gives the guide card the app's language and Markdown: the model writes
// guide bodies in Markdown, and app-shell renders neither.
//
// While a guide points at the page the copilot steps aside — minimized to its
// engenty in the app bar — so it does not cover what the guide shows. It
// comes back once no guide is open AND its run has finished: between two
// steps of a tour the guide is closed while the model writes the next one,
// and reopening there made the window flicker in and out.

import {
  ENGENTY_COPILOT_HOST_KEY,
  MessageResponse,
  useAgentHost,
} from "@engenty/ai-ui";
import {
  type GuideCardText,
  GuideOverlayHost,
  getUiGuideSession,
  subscribeUiGuide,
  useCopilotActionsOrNull,
  useCopilotLayoutOrNull,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

/** Single line breaks are the model's bullets; Markdown would join them. */
function keepLineBreaks(body: string): string {
  return body.replace(/([^\n])\n(?!\n)/g, "$1  \n");
}

function useUiGuideOpen(): boolean {
  return useSyncExternalStore(
    subscribeUiGuide,
    () => getUiGuideSession() !== null,
    () => false
  );
}

function useCopilotStepsAsideForGuide(running: boolean) {
  const guideOpen = useUiGuideOpen();
  const layout = useCopilotLayoutOrNull();
  const actions = useCopilotActionsOrNull();
  const hidden = useRef(false);
  const openRef = useRef(layout?.open === true);
  openRef.current = layout?.open === true;

  useEffect(() => {
    if (!actions) {
      return;
    }
    if (guideOpen) {
      if (openRef.current) {
        hidden.current = true;
        actions.setOpen(false);
      }
      return;
    }
    if (hidden.current && !running) {
      hidden.current = false;
      actions.setOpen(true);
    }
  }, [actions, guideOpen, running]);
}

export function GuideOverlayHostWithBridge() {
  const { t } = useTranslation("common");
  const host = useAgentHost(ENGENTY_COPILOT_HOST_KEY);
  useCopilotStepsAsideForGuide(
    host.status === "streaming" || host.status === "submitted"
  );
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
  const text = useMemo<GuideCardText>(
    () => ({
      dismissLabel: t("copilot.guideDismiss"),
      renderBody: (body) => (
        <MessageResponse className="text-muted-foreground text-sm leading-relaxed">
          {keepLineBreaks(body)}
        </MessageResponse>
      ),
    }),
    [t]
  );

  return <GuideOverlayHost onFollowUpMessage={onFollowUpMessage} text={text} />;
}
